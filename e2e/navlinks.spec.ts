import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';
const RUN = Date.now().toString(36);
const LABEL = `Zeta ${RUN}`;
const CHILD = `Eta ${RUN}`;

const reorderSaved = (page: Page) =>
    page.waitForResponse((r) => r.url().includes('/_actions/navlinks.reorder') && r.ok());

/** Labels of the top-level cards, in page order. */
const topLabels = (page: Page) =>
    page
        .locator('[data-testid="nav-top"]')
        .evaluateAll((els) =>
            els.map((el) => el.querySelector('[data-testid="nav-label"]')?.textContent?.trim() ?? ''),
        );

const childLabels = (page: Page, parent: string) =>
    page
        .locator('[data-testid="nav-top"]', {
            has: page.getByRole('button', { name: new RegExp(`^Reorder ${parent}\\.`) }),
        })
        .locator('[data-testid="nav-child"] [data-testid="nav-label"]')
        .allTextContents();

const handle = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^Reorder ${label}\\.`) });

/** Top-level header labels as server-rendered HTML shows them (no JavaScript). */
async function publicHeader(browser: Browser) {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    const labels = await page
        .locator('#primary-menu > li > a, #primary-menu > li > button')
        .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));
    const nested = await page.locator('#primary-menu li li a').allTextContents();
    await context.close();
    return { labels, nested };
}

async function addLink(page: Page, label: string, url: string, parent?: string) {
    if (parent) {
        await page.getByRole('button', { name: new RegExp(`^Add child link\\s*under ${parent}$`) }).click();
    } else {
        await page.getByRole('button', { name: 'Add link', exact: true }).click();
    }
    const form = page.getByRole('form', { name: parent ? `Add link under ${parent}` : 'Add link' });
    await form.getByLabel('Label').fill(label);
    await form.getByLabel('URL').fill(url);
    await form.getByRole('button', { name: 'Add link', exact: true }).click();
    await expect(page.getByTestId('nav-label').filter({ hasText: label })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('as superadmin', () => {
    test.use({ storageState: ADMIN });

    test('page is an editor, not a table, with a single h1', async ({ page }) => {
        await page.goto('/admin/navlinks');
        await expect(page.getByRole('heading', { level: 1, name: 'Navigation links' })).toBeVisible();
        await expect(page.locator('table')).toHaveCount(0);
        await expect(page.getByTestId('nav-top').first()).toBeVisible();
        await expect(page.getByTestId('nav-preview')).toBeVisible();
    });

    test('validates the URL before saving', async ({ page }) => {
        await page.goto('/admin/navlinks');
        await page.getByRole('button', { name: 'Add link', exact: true }).click();
        const form = page.getByRole('form', { name: 'Add link' });
        await form.getByLabel('Label').fill('Bad');
        await form.getByLabel('URL').fill('javascript:alert(1)');
        await form.getByRole('button', { name: 'Add link', exact: true }).click();
        await expect(form.getByRole('alert')).toContainText('full https:// URL');
        await form.getByRole('button', { name: 'Cancel' }).click();
        await expect(form).toHaveCount(0);
    });

    test('add a link, move it to the top with the keyboard, and the header follows', async ({ page, browser }) => {
        await page.goto('/admin/navlinks');
        await addLink(page, LABEL, '/zeta-test');
        const initial = await topLabels(page);
        expect(initial).toContain(LABEL);

        await handle(page, LABEL).focus();
        for (let i = 0; i < initial.indexOf(LABEL); i++) {
            const saved = reorderSaved(page);
            await page.keyboard.press('ArrowUp');
            await saved;
            await expect(handle(page, LABEL)).toBeFocused();
        }
        expect((await topLabels(page))[0]).toBe(LABEL);

        await page.reload();
        expect((await topLabels(page))[0]).toBe(LABEL);
        expect((await publicHeader(browser)).labels[0]).toBe(LABEL);
    });

    test('mouse drag reorders and persists', async ({ page, browser }) => {
        await page.goto('/admin/navlinks');
        const before = await topLabels(page);
        expect(before[0]).toBe(LABEL);
        const treeBefore = await page.getByTestId('nav-label').allTextContents();

        const grip = await handle(page, LABEL).boundingBox();
        const lastCard = await page.getByTestId('nav-top').nth(1).boundingBox();
        expect(grip && lastCard).toBeTruthy();
        const saved = reorderSaved(page);
        await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip!.x + 20, grip!.y + 30, { steps: 5 });
        const dropY = lastCard!.y + 22;
        await page.mouse.move(lastCard!.x + lastCard!.width / 2, dropY - 10, { steps: 25 });
        await page.mouse.move(lastCard!.x + lastCard!.width / 2, dropY, { steps: 5 });
        await page.mouse.up();
        await saved;

        const after = await topLabels(page);
        const tree = () => page.getByTestId('nav-label').allTextContents();
        const treeAfter = await tree();
        // Dropping over a card may also nest the link; either way the tree changed and must persist.
        expect(treeAfter).not.toEqual(treeBefore);
        await page.reload();
        expect(await tree()).toEqual(treeAfter);
        expect(await topLabels(page)).toEqual(after);
        expect((await publicHeader(browser)).labels.slice(0, after.length)).toEqual(after);
    });

    test('nest and un-nest with the keyboard, toggle active, delete', async ({ page, browser }) => {
        await page.goto('/admin/navlinks');
        if (!(await topLabels(page)).includes(LABEL)) {
            const back = reorderSaved(page);
            await page.getByRole('button', { name: `Make ${LABEL} a top-level link` }).click();
            await back;
        }
        const tops = await topLabels(page);
        const index = tops.indexOf(LABEL);
        // Keep the link where it is but make sure there is a previous top-level link to nest under.
        expect(index).toBeGreaterThan(0);
        const parent = tops[index - 1];

        // Nest: the link above must not be nested itself, which holds for top-level cards.
        await handle(page, LABEL).focus();
        let saved = reorderSaved(page);
        await page.keyboard.press('ArrowRight');
        await saved;
        expect(await childLabels(page, parent)).toContain(LABEL);
        expect((await publicHeader(browser)).nested).toContain(LABEL);

        // Un-nest puts it right after its parent again.
        await expect(handle(page, LABEL)).toBeFocused();
        saved = reorderSaved(page);
        await page.keyboard.press('ArrowLeft');
        await saved;
        const afterUnnest = await topLabels(page);
        expect(afterUnnest.indexOf(LABEL)).toBe(afterUnnest.indexOf(parent) + 1);

        // A parent that has children cannot become a child.
        await addLink(page, CHILD, '/eta-test', LABEL);
        await expect(page.getByRole('button', { name: `Make ${LABEL} a sub-link of the link above` })).toBeDisabled();

        // Hidden links leave the public header.
        saved = page.waitForResponse((r) => r.url().includes('/_actions/navlinks.update') && r.ok());
        await page.getByRole('switch', { name: `Visible in navigation: ${LABEL}` }).click();
        await saved;
        await expect(page.getByRole('switch', { name: `Visible in navigation: ${LABEL}` })).toHaveAttribute(
            'aria-checked',
            'false',
        );
        await page.reload();
        await expect(page.getByRole('switch', { name: `Visible in navigation: ${LABEL}` })).toHaveAttribute(
            'aria-checked',
            'false',
        );
        expect((await publicHeader(browser)).labels).not.toContain(LABEL);

        // Undo/redo of order changes.
        await handle(page, LABEL).focus();
        const before = await topLabels(page);
        saved = reorderSaved(page);
        await page.keyboard.press('ArrowDown');
        await saved;
        expect(await topLabels(page)).not.toEqual(before);
        saved = reorderSaved(page);
        await page.getByRole('button', { name: 'Undo' }).click();
        await saved;
        expect(await topLabels(page)).toEqual(before);

        // Delete the parent (and its child) via the confirm dialog.
        await page.getByRole('button', { name: `Delete ${LABEL}` }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
        await expect(page.getByTestId('nav-label').filter({ hasText: LABEL })).toHaveCount(0);
        await expect(page.getByTestId('nav-label').filter({ hasText: CHILD })).toHaveCount(0);
        const header = await publicHeader(browser);
        expect(header.labels).not.toContain(LABEL);
        expect(header.nested).not.toContain(CHILD);
    });
});

test.describe('as department user', () => {
    test.use({ storageState: CIT });

    test('cannot open or call the navigation editor', async ({ page }) => {
        expect((await page.goto('/admin/navlinks'))?.status()).toBe(403);
        const response = await page.request.post('/_actions/navlinks.reorder', {
            data: { items: [{ id: 1, parentId: null, order: 1 }] },
        });
        expect(response.status()).toBe(403);
    });
});
