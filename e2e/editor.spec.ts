import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { AI_LAB_HEADING, AI_LAB_QUOTE, DEMO_POSTS } from '../prisma/demo-data';
import { postAction } from './actions';
import { ADMIN, CIT } from './auth-state';
import { visitorPage } from './support';

const canvas = (page: Page) => page.frameLocator('iframe[title="Visual canvas"]');
const add = (page: Page, label: string) => page.getByRole('button', { name: `Add ${label}`, exact: true });

/** Waits until the canvas iframe has rendered its document. */
async function editorReady(page: Page) {
    await expect(page.getByRole('toolbar', { name: 'Editor toolbar' })).toBeVisible();
    await expect(canvas(page).locator('#sic-root')).toBeAttached();
}

/** Pointer-drags a palette element onto the lower part of the canvas (drop at the end of the document). */
async function dragFromPalette(page: Page, label: string) {
    const source = await add(page, label).boundingBox();
    const frame = await page.locator('iframe[title="Visual canvas"]').boundingBox();
    expect(source && frame).toBeTruthy();
    await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
    await page.mouse.down();
    await page.mouse.move(source!.x + source!.width / 2 + 24, source!.y + source!.height / 2 + 8, { steps: 4 });
    await page.mouse.move(frame!.x + frame!.width / 2, frame!.y + frame!.height - 24, { steps: 12 });
    await page.mouse.up();
}

test.describe('visual block editor (superadmin)', () => {
    test.use({ storageState: ADMIN });

    test('builds a post from blocks, publishes it and renders it server-side', async ({ page, browser }) => {
        const title = `E2E blocks ${Date.now()}`;
        const headline = `Headline ${Date.now()}`;

        await page.goto('/admin/posts/create');
        await editorReady(page);
        await page.getByLabel('Post title').fill(title);

        // Empty state offers starter templates built from real blocks.
        await expect(page.getByRole('heading', { name: 'Start with a template' })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Two-column cards/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /^FAQ/ })).toBeVisible();

        // Click-to-insert: heading, then a row (inserted after the heading) with a card inside, duplicated.
        await add(page, 'Heading').click();
        await page.getByLabel('Heading text').fill(headline);
        await expect(canvas(page).getByRole('heading', { level: 2, name: headline })).toBeVisible();

        await add(page, 'Row / Flex').click();
        await add(page, 'Card').click();
        await page.getByLabel('Card title').fill('First card');
        await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
        await page.getByLabel('Card title').fill('Second card');
        await expect(canvas(page).locator('[data-block-type="card"]')).toHaveCount(2);

        // Drag & drop from the palette onto the canvas.
        await dragFromPalette(page, 'Table');
        await expect(canvas(page).locator('[data-block-type="table"]')).toHaveCount(1);
        await page.getByLabel('Row 1, column 1').fill('Step');
        await page.getByLabel('Row 1, column 2').fill('Details');
        await page.getByLabel('Row 2, column 1').fill('One');
        await page.getByLabel('Row 2, column 2').fill('Bring your documents');
        await page.getByLabel('Table caption').fill('Enrolment steps');

        // Button via palette (inserted after the selected table).
        await add(page, 'Button').click();
        await page.getByLabel('Button label').fill('Read the guide');
        await page.getByLabel('Button link').fill('/posts');

        // A second block type check: unsafe links are flagged by the inspector.
        await page.getByLabel('Button link').fill('javascript:alert(1)');
        await expect(
            page
                .getByRole('alert')
                .filter({ hasText: /valid link|not allowed|https/i })
                .first(),
        ).toBeVisible();
        await page.getByLabel('Button link').fill('/posts');

        // Canvas selection and keyboard reorder: move the button above the table.
        await canvas(page).locator('[data-block-type="button"] a').click();
        await expect(page.getByLabel('Button label')).toHaveValue('Read the guide');
        await page.keyboard.press('Alt+ArrowUp');
        const order = await canvas(page)
            .locator('[data-block-id]')
            .evaluateAll((els) =>
                els
                    .map((el) => el.getAttribute('data-block-type'))
                    .filter((type) => type === 'button' || type === 'table'),
            );
        expect(order).toEqual(['button', 'table']);

        // Undo / redo with the keyboard.
        await page.keyboard.press('Control+z');
        await expect(canvas(page).locator('[data-block-type="button"]')).toHaveCount(1);
        const afterUndo = await canvas(page)
            .locator('[data-block-id]')
            .evaluateAll((els) =>
                els
                    .map((el) => el.getAttribute('data-block-type'))
                    .filter((type) => type === 'button' || type === 'table'),
            );
        expect(afterUndo).toEqual(['table', 'button']);
        await page.keyboard.press('Control+Shift+z');

        // The editor itself has no serious accessibility violations.
        const axe = await new AxeBuilder({ page })
            .include('[data-block-editor]')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
        const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

        await page.getByRole('button', { name: 'Publish post' }).click();
        await expect(page).toHaveURL(/\/admin\/posts$/);

        // Excerpt on the public list is plain text, never JSON.
        await page.goto(`/posts?search=${encodeURIComponent(title)}`);
        const link = page.getByRole('link', { name: title }).first();
        await expect(link).toBeVisible();
        const main = await page.locator('main').innerText();
        expect(main).toContain(headline);
        expect(main).not.toMatch(/sic-blocks|"blocks"|\{"type"/);
        const href = await link.getAttribute('href');
        expect(href).toMatch(/^\/posts\//);

        // Public page: rendered on the server (JavaScript disabled), semantic HTML, one h1.
        const visitor = await visitorPage(browser);
        await visitor.goto(href!);
        await expect(visitor.locator('h1')).toHaveCount(1);
        await expect(visitor.getByRole('heading', { level: 2, name: headline })).toBeVisible();
        await expect(visitor.locator('[data-sic-blocks] article')).toHaveCount(2);
        await expect(visitor.getByRole('heading', { level: 3, name: 'First card' })).toBeVisible();
        await expect(visitor.getByRole('heading', { level: 3, name: 'Second card' })).toBeVisible();
        await expect(visitor.locator('[data-sic-blocks] table caption')).toHaveText('Enrolment steps');
        await expect(visitor.locator('[data-sic-blocks] table thead th[scope="col"]')).toHaveText(['Step', 'Details']);
        await expect(visitor.locator('[data-sic-blocks] table tbody td').last()).toHaveText('Bring your documents');
        const button = visitor.getByRole('link', { name: 'Read the guide' });
        await expect(button).toHaveAttribute('href', '/posts');
        // Button was moved above the table, then undo/redo restored the moved order.
        const buttonBeforeTable = await visitor.evaluate(() => {
            const a = document.querySelector('[data-sic-blocks] a[href="/posts"]');
            const t = document.querySelector('[data-sic-blocks] table');
            return Boolean(a && t && a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        expect(buttonBeforeTable).toBe(true);
        expect(await visitor.content()).not.toContain('sic-blocks"');
        await visitor.context().close();
    });

    test('builds a post with a 3-image album and opens its lightbox on the public page', async ({ page, browser }) => {
        const title = `E2E album ${Date.now()}`;
        const seal = fs.readFileSync(path.resolve('public/sic-seal.png'));

        await page.goto('/admin/posts/create');
        await editorReady(page);
        await page.getByLabel('Post title').fill(title);
        await add(page, 'Album').click();
        await page
            .getByLabel('Choose image files')
            .setInputFiles([1, 2, 3].map((n) => ({ name: `seal-${n}.png`, mimeType: 'image/png', buffer: seal })));
        await expect(page.getByLabel('Image 3 alt text')).toBeVisible({ timeout: 30_000 });
        for (const n of [1, 2, 3]) await page.getByLabel(`Image ${n} alt text`).fill(`School seal ${n}`);
        await page.getByLabel('Image 2 caption (optional)').fill('Second seal');
        await expect(canvas(page).locator('[data-block-type="album"] img')).toHaveCount(3);

        await page.getByRole('button', { name: 'Publish post' }).click();
        await expect(page).toHaveURL(/\/admin\/posts$/);

        await page.goto(`/posts?search=${encodeURIComponent(title)}`);
        const href = await page.getByRole('link', { name: title }).first().getAttribute('href');
        expect(href).toMatch(/^\/posts\//);

        // Without JavaScript the thumbnails are plain links to the full images.
        const noScript = await visitorPage(browser);
        await noScript.goto(href!);
        const noScriptLinks = noScript.locator('[data-album] a[data-album-item]');
        await expect(noScriptLinks).toHaveCount(3);
        expect(await noScriptLinks.first().getAttribute('href')).toMatch(/^\/storage\/posts\/inline\/[0-9a-f]+\.webp$/);
        await noScript.context().close();

        const context = await browser.newContext();
        const visitor = await context.newPage();
        await visitor.goto(href!);
        const links = visitor.locator('[data-album] a[data-album-item]');
        await expect(links).toHaveCount(3);
        const first = links.first();
        await first.click();

        const lightbox = visitor.getByRole('dialog', { name: 'Image viewer' });
        await expect(lightbox).toBeVisible();
        await expect(lightbox.getByText('1 of 3')).toBeVisible();
        await expect(lightbox.getByRole('img', { name: 'School seal 1' })).toBeVisible();
        // Focus is inside the dialog while it is open.
        expect(await visitor.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);

        await visitor.keyboard.press('ArrowRight');
        await expect(lightbox.getByText('2 of 3')).toBeVisible();
        await expect(lightbox.getByRole('img', { name: 'School seal 2' })).toBeVisible();
        await expect(lightbox.getByText('Second seal')).toBeVisible();

        await visitor.keyboard.press('Escape');
        await expect(lightbox).toBeHidden();
        await expect(first).toBeFocused();
        await context.close();
    });

    test('keyboard: arrows select, Enter focuses text, Delete removes, palette Enter inserts', async ({ page }) => {
        await page.goto('/admin/posts/create');
        await editorReady(page);

        await add(page, 'Heading').focus();
        await page.keyboard.press('Enter');
        await expect(canvas(page).locator('[data-block-type="heading"]')).toHaveCount(1);
        await add(page, 'Text').focus();
        await page.keyboard.press('Enter');
        await expect(canvas(page).locator('[data-block-type="paragraph"]')).toHaveCount(1);

        await canvas(page).locator('[data-block-type="heading"]').click();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('heading', { name: 'Text properties' })).toBeVisible();
        await page.keyboard.press('Delete');
        await expect(canvas(page).locator('[data-block-type="paragraph"]')).toHaveCount(0);
        await page.keyboard.press('Control+z');
        await expect(canvas(page).locator('[data-block-type="paragraph"]')).toHaveCount(1);
    });

    test('opens an existing Markdown post as a legacy block and keeps it rendering unchanged', async ({ page }) => {
        const slug = 'cit-unveils-new-ai-research-laboratory';
        await page.goto(`/posts/${slug}`);
        await expect(page.getByRole('heading', { level: 2, name: AI_LAB_HEADING })).toBeVisible();
        await expect(page.locator('blockquote')).toContainText(AI_LAB_QUOTE);
        await expect(page.locator('h1')).toHaveCount(1);

        await page.goto(`/admin/posts?q=${DEMO_POSTS.aiLab.title}`);
        await page.getByRole('link', { name: `Edit post ${DEMO_POSTS.aiLab.title}` }).click();
        await editorReady(page);
        await expect(page.getByText(/contains.*Markdown \(legacy\).*blocks/)).toBeVisible();
        await canvas(page).locator('[data-block-type="markdown"]').click();
        await expect(page.getByLabel('Markdown source')).toHaveValue(new RegExp(`# ${AI_LAB_HEADING}`));

        // Converting keeps the content, as editable blocks.
        await page.getByRole('button', { name: 'Convert to blocks' }).first().click();
        await expect(canvas(page).getByRole('heading', { level: 2, name: AI_LAB_HEADING })).toBeVisible();
        await expect(canvas(page).locator('blockquote')).toBeVisible();
        await expect(canvas(page).locator('[data-block-type="markdown"]')).toHaveCount(0);
        // Leave without saving: the seeded post stays Markdown for the other tests.
    });

    test('hero section saved as blocks renders on the home page', async ({ page, browser }) => {
        const headline = `Hero ${Date.now()}`;
        await page.goto('/admin/hero-sections/create');
        await editorReady(page);
        await page.getByLabel('Administrative title').fill(`E2E hero ${headline}`);
        await page.getByRole('button', { name: /Hero intro/ }).click();
        await canvas(page).locator('[data-block-type="heading"]').click();
        await page.getByLabel('Heading text').fill(headline);
        await page.getByRole('button', { name: 'Create section' }).click();
        await expect(page).toHaveURL(/\/admin\/hero-sections$/);

        const visitor = await visitorPage(browser);
        await visitor.goto('/');
        await expect(visitor.getByRole('heading', { level: 2, name: headline })).toBeVisible();
        await expect(visitor.locator('h1')).toHaveCount(1);
        await visitor.context().close();
    });

    test('landing settings save a block document that the home page renders', async ({ page, browser }) => {
        const text = `Landing note ${Date.now()}`;
        await page.goto('/admin/settings/landing');
        await editorReady(page);
        // Idempotent: the first run converts the seeded Markdown, later runs already have blocks.
        const convert = page.getByRole('button', { name: 'Convert to blocks' }).first();
        if (await convert.isVisible()) await convert.click();
        await add(page, 'Text').click();
        await page.getByLabel('Text', { exact: true }).fill(text);
        await page.getByRole('button', { name: 'Save settings' }).click();
        await expect(page.getByText('Landing page settings updated successfully.')).toBeVisible();

        const visitor = await visitorPage(browser);
        await visitor.goto('/');
        await expect(visitor.getByText(text)).toBeVisible();
        await expect(
            visitor.getByRole('heading', { level: 2, name: 'Welcome to San Isidro College' }).first(),
        ).toBeVisible();
        expect(await visitor.content()).not.toContain('sic-blocks"');
        await visitor.context().close();
    });

    test('rejects an invalid block document on the server', async ({ page }) => {
        await page.goto('/admin/posts/create');
        await editorReady(page);
        const result = await postAction(page, 'posts.create', {
            multipart: {
                title: 'Bad doc',
                type: 'article',
                isFeatured: 'false',
                content: JSON.stringify({
                    type: 'sic-blocks',
                    version: 1,
                    blocks: [{ id: 'b1', type: 'image', props: { src: '/storage/x.png', alt: '' } }],
                }),
            },
        });
        expect(result.status).toBe(400);
        expect(result.text).toMatch(/alt text/i);
    });
});

test.describe('visual block editor (department user)', () => {
    test.use({ storageState: CIT });

    test('creates a post for their department with the block editor', async ({ page }) => {
        const title = `CIT blocks ${Date.now()}`;
        await page.goto('/admin/posts/create');
        await editorReady(page);
        await page.getByLabel('Post title').fill(title);
        await add(page, 'Text').click();
        await page.getByLabel('Text', { exact: true }).fill('Written by a department editor.');
        await page.getByRole('button', { name: 'Publish post' }).click();
        await expect(page).toHaveURL(/\/admin\/posts$/);
        await expect(page.locator('main')).toContainText(title);
    });
});
