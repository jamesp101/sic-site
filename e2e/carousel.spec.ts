import { expect, test, type Browser, type Page } from '@playwright/test';

import { postAction } from './actions';
import { ADMIN, CIT } from './auth-state';
import { RUN, SEAL, clickUntilVisible, visitorPage } from './support';

const ALPHA = { headline: `E2E Alpha ${RUN}`, label: `E2E Alpha Button ${RUN}`, href: '/posts' };
const BETA = { headline: `E2E Beta ${RUN}`, label: `E2E Beta Button ${RUN}`, href: '/downloads' };

const GAMMA = { headline: `E2E Gamma ${RUN}`, label: `E2E Gamma Button ${RUN}`, href: '/posts' };
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

let alphaId = '';

const saved = (page: Page, action: string) =>
    page.waitForResponse((r) => r.url().includes(`/_actions/carousels.${action}`) && r.ok());

/** Clicks "Add slide", retrying until the island has hydrated and the new slide's Create button shows. */
async function addSlide(page: Page) {
    await clickUntilVisible(
        page.getByRole('button', { name: 'Add slide' }).first(),
        page.getByRole('button', { name: 'Create slide' }),
    );
}

async function createSlide(page: Page, slide: typeof ALPHA, extra?: (page: Page) => Promise<void>) {
    await addSlide(page);
    await page.locator('#slide-image').setInputFiles(SEAL);
    await page.getByRole('button', { name: 'Apply Crop' }).click();

    await page.getByRole('button', { name: 'Add text' }).click();
    await page.locator('#layer-text').fill(slide.headline);
    await page.getByRole('button', { name: 'Add button' }).click();
    await page.locator('#layer-label').fill(slide.label);
    await page.locator('#layer-href').fill(slide.href);
    await extra?.(page);

    const created = saved(page, 'create');
    await page.getByRole('button', { name: 'Create slide' }).click();
    await created;
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
}

/** The home page carousel as server-rendered HTML shows it (no JavaScript). */
async function publicHome(browser: Browser) {
    const page = await visitorPage(browser);
    await page.goto('/');
    const section = page.locator('section[aria-roledescription="carousel"]');
    const result = {
        h1: await page.locator('h1').count(),
        headings: (await section.locator('h2').allTextContents()).filter((t) => t.includes(RUN)),
        links: (
            await section
                .locator('a')
                .evaluateAll((els) =>
                    els.map((el) => [el.textContent?.replace('→', '').trim() ?? '', el.getAttribute('href')]),
                )
        ).filter(([label]) => label?.includes(RUN)),
        text: (await section.count()) ? await section.textContent() : '',
        injected: await section.locator('b').count(),
    };
    await page.context().close();
    return result;
}

/** Strip labels of this run's slides, in strip order. */
const mine = async (page: Page) => (await stripOrder(page)).filter((label) => label.includes(RUN));
const positionOf = (label: string) => label.match(/slide (\d+)/)?.[1] ?? '';
const tile = (page: Page, headline: string) => page.locator(`[data-slide-id][aria-label*="${headline}"]`);

const stripOrder = (page: Page) =>
    page.locator('[data-slide-id]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));

test.describe.configure({ mode: 'serial' });

test.describe('slide designer (superadmin)', () => {
    test.use({ storageState: ADMIN });

    test('create a slide with text and a button, move a layer with the keyboard, save and reload', async ({
        page,
        browser,
    }) => {
        await page.goto('/admin/carousels');
        await expect(page.getByRole('heading', { level: 1, name: 'Slide designer' })).toBeVisible();
        await expect(page.getByRole('table')).toHaveCount(0);

        // A new slide needs an image.
        await addSlide(page);
        await page.getByRole('button', { name: 'Create slide' }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Choose a slide image' }).first()).toBeVisible();
        await page.reload();

        await createSlide(page, ALPHA);

        // Keyboard: focus the button layer on the canvas, nudge it with the arrow keys.
        await page.getByRole('button', { name: `Button: ${ALPHA.label}` }).focus();
        await expect(page.locator('#layer-y')).toHaveValue('72');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#layer-y')).toHaveValue('74');
        await expect(page.locator('#layer-x')).toHaveValue('9');

        // Undo (Ctrl+Z) walks the nudges back in one step, redo restores it.
        await page.keyboard.press('Control+z');
        await expect(page.locator('#layer-y')).toHaveValue('72');
        await page.keyboard.press('Control+Shift+z');
        await expect(page.locator('#layer-y')).toHaveValue('74');

        const update = saved(page, 'update');
        await page.keyboard.press('Control+s');
        await update;
        await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

        await page.reload();
        alphaId = (await tile(page, ALPHA.headline).getAttribute('data-slide-id')) ?? '';
        expect(alphaId).not.toBe('');
        await tile(page, ALPHA.headline).click();
        await page.getByRole('button', { name: `Button: ${ALPHA.label}` }).click();
        await expect(page.locator('#layer-y')).toHaveValue('74');
        await expect(page.locator('#layer-href')).toHaveValue(ALPHA.href);

        const home = await publicHome(browser);
        expect(home.h1).toBe(1);
        expect(home.headings).toEqual([ALPHA.headline]);
        expect(home.links).toEqual([[ALPHA.label, ALPHA.href]]);
    });

    test('a second slide shows overlays in order; HTML in text stays text', async ({ page, browser }) => {
        await page.goto('/admin/carousels');
        await createSlide(page, BETA, async (p) => {
            await p.getByRole('button', { name: 'Add badge' }).click();
            await p.locator('#layer-badge').fill('<b>E2E</b>');
        });

        const home = await publicHome(browser);
        expect(home.headings).toEqual([ALPHA.headline, BETA.headline]);
        expect(home.links).toEqual([
            [ALPHA.label, ALPHA.href],
            [BETA.label, BETA.href],
        ]);
        expect(home.text).toContain('<b>E2E</b>');
        expect(home.injected).toBe(0);
    });

    test('reorder with the slide menu persists and drives the public order', async ({ page, browser }) => {
        await page.goto('/admin/carousels');
        await expect(tile(page, BETA.headline)).toBeAttached();
        expect(await mine(page)).toHaveLength(2);
        const betaPosition = positionOf((await tile(page, BETA.headline).getAttribute('aria-label')) ?? '');

        await page.getByRole('button', { name: `Actions for slide ${betaPosition}` }).click();
        const reordered = saved(page, 'reorder');
        await page.getByRole('button', { name: 'Move earlier' }).click();
        await reordered;
        await expect.poll(async () => (await mine(page))[0]).toContain(BETA.headline);

        await page.reload();
        await expect(tile(page, ALPHA.headline)).toBeAttached();
        expect((await mine(page))[0]).toContain(BETA.headline);
        expect((await publicHome(browser)).headings).toEqual([BETA.headline, ALPHA.headline]);
    });

    test('reorder with the drag handle and the keyboard', async ({ page, browser }) => {
        await page.goto('/admin/carousels');
        await expect(tile(page, BETA.headline)).toBeAttached();
        expect((await mine(page))[0]).toContain(BETA.headline);
        const firstPosition = positionOf((await mine(page))[0]);

        const reordered = saved(page, 'reorder');
        // svelte-dnd-action's keyboard drag lives on the draggable row (a tab stop).
        await page
            .locator('ul[aria-label="Slides"] > li')
            .nth(Number(firstPosition) - 1)
            .focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await reordered;

        await page.reload();
        await expect(tile(page, ALPHA.headline)).toBeAttached();
        expect((await mine(page))[0]).toContain(ALPHA.headline);
        expect((await publicHome(browser)).headings).toEqual([ALPHA.headline, BETA.headline]);
    });

    test('the server rejects unsafe designs', async ({ page }) => {
        await page.goto('/admin/carousels');
        const layer = (extra: object) =>
            JSON.stringify({
                v: 1,
                layers: [
                    {
                        type: 'button',
                        id: 'bad1',
                        x: 10,
                        y: 10,
                        rotation: 0,
                        opacity: 100,
                        label: 'Go',
                        href: '/',
                        variant: 'solid',
                        color: 'gold',
                        size: 'sm',
                        ...extra,
                    },
                ],
            });

        for (const bad of [{ href: 'javascript:alert(1)' }, { color: '#ff0000' }, { onclick: 'x' }]) {
            const response = await postAction(page, 'carousels.update', {
                multipart: { id: alphaId, overlay: layer(bad) },
            });
            expect(response.status, `${JSON.stringify(bad)} id=${alphaId} ${response.text}`).toBe(400);
        }
    });
});

test.describe('element sizes', () => {
    test.use({ storageState: ADMIN });

    test('old-format sizes load as the nearest step and equal buttons render at equal height', async ({
        page,
        browser,
    }) => {
        await page.goto('/admin/carousels');
        const base = { rotation: 0, opacity: 100 };
        const button = (id: string, label: string, y: number) => ({
            type: 'button',
            id,
            ...base,
            x: 6,
            y,
            label,
            href: '/',
            variant: 'solid',
            color: 'gold',
            size: '3xl', // stored by the first designer version
        });
        const overlay = JSON.stringify({
            v: 1,
            layers: [
                {
                    type: 'text',
                    id: 'h1x',
                    ...base,
                    x: 6,
                    y: 20,
                    w: 55,
                    role: 'heading',
                    text: ALPHA.headline,
                    size: '2xl',
                    align: 'left',
                    color: 'white',
                    font: 'serif',
                },
                button('b1x', ALPHA.label, 60),
                button('b2x', `${ALPHA.label} two`, 75),
            ],
        });
        const response = await postAction(page, 'carousels.update', { multipart: { id: alphaId, overlay } });
        expect(response.status).toBe(200);

        // Saved in the new form: the button is Large and the heading Medium.
        await page.goto('/admin/carousels');
        await tile(page, ALPHA.headline).click();
        await page.getByRole('button', { name: `Button: ${ALPHA.label}`, exact: true }).click();
        await expect(page.getByRole('group', { name: 'Size' }).getByRole('button', { name: 'Large' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        const home = await visitorPage(browser);
        await home.goto('/');
        const links = home.locator('section[aria-roledescription="carousel"] a', { hasText: ALPHA.label });
        await expect(links).toHaveCount(2);
        const [a, b] = await links.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
        expect(a).toBeGreaterThan(10);
        expect(Math.abs(a - b)).toBeLessThan(0.5);
        await home.context().close();
    });
});

/** Third-party players are never loaded in tests; the iframe element is all that is asserted. */
const blockYoutube = (page: Page) => page.route('**/*youtube-nocookie.com/**', (route) => route.abort());

const heroOf = (page: Page) => page.locator('section[aria-roledescription="carousel"]');
const slideOf = (page: Page, headline: string) =>
    heroOf(page).locator('[aria-roledescription="slide"]', { has: page.locator('h2', { hasText: headline }) });

/** Shows the slide with this headline (dot navigation) and returns its locator. */
async function showSlide(page: Page, headline: string) {
    await expect(heroOf(page)).toBeVisible();
    const slide = slideOf(page, headline);
    const position =
        (await heroOf(page)
            .locator('[aria-roledescription="slide"]')
            .evaluateAll((els, text) => els.findIndex((el) => el.textContent?.includes(text)), headline)) + 1;
    await expect(async () => {
        await page.getByRole('button', { name: `Go to slide ${position}`, exact: true }).click({ timeout: 1500 });
        await expect(slide).not.toHaveAttribute('inert', '', { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    return slide;
}

/** Top of the headline inside the hero, in percent of the hero's height. */
async function headlineTop(page: Page, headline: string) {
    const slide = slideOf(page, headline);
    const hero = await heroOf(page).boundingBox();
    const box = await slide.locator('h2', { hasText: headline }).boundingBox();
    if (!hero || !box) throw new Error('hero or headline has no box');
    return ((box.y - hero.y) / hero.height) * 100;
}

test.describe('background video and phone layout', () => {
    test.use({ storageState: ADMIN });

    test('a YouTube background renders a muted, controls-free nocookie embed on the active slide only', async ({
        page,
    }) => {
        await blockYoutube(page);
        await page.goto('/admin/carousels');
        await createSlide(page, GAMMA, async (p) => {
            await p.getByRole('button', { name: 'Slide', exact: true }).click();
            await p.locator('#slide-video-link').fill('https://vimeo.com/123456789');
            await p.locator('#slide-video-link').press('Enter');
            await expect(p.locator('#slide-video-link-error')).toBeVisible();
            await p.locator('#slide-video-link').fill(YOUTUBE);
            await p.locator('#slide-video-link').press('Enter');
            await expect(p.locator('#slide-video-link-error')).toHaveCount(0);
        });

        // The link is stored and comes back in the designer.
        await page.reload();
        await page.getByRole('button', { name: new RegExp(`^Edit slide \\d+ of \\d+: ${GAMMA.headline}`) }).click();
        await expect(page.locator('#slide-video-link')).toHaveValue(YOUTUBE);

        await page.goto('/');
        const slide = await showSlide(page, GAMMA.headline);
        const frame = slide.locator('iframe');
        await expect(frame).toHaveCount(1);
        const src = new URL((await frame.getAttribute('src')) ?? '');
        expect(src.origin).toBe('https://www.youtube-nocookie.com');
        expect(src.pathname).toBe('/embed/dQw4w9WgXcQ');
        expect(Object.fromEntries(src.searchParams)).toMatchObject({
            autoplay: '1',
            mute: '1',
            loop: '1',
            playlist: 'dQw4w9WgXcQ',
            controls: '0',
            modestbranding: '1',
        });
        await expect(frame).toHaveAttribute('tabindex', '-1');
        await expect(frame).toHaveClass(/pointer-events-none/);
        await expect(frame.locator('xpath=ancestor::div[@aria-hidden="true"]')).toHaveCount(1);
        // The photo stays underneath as the poster, and other slides never load a player.
        await expect(slide.locator('img.slide-photo')).toHaveCount(1);
        await expect(heroOf(page).locator('iframe')).toHaveCount(1);
    });

    test('reduced motion and data saver keep the photo only', async ({ browser }) => {
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        const page = await context.newPage();
        await blockYoutube(page);
        await page.goto('/');
        await expect(heroOf(page)).toBeVisible();
        await page.waitForTimeout(500);
        await expect(heroOf(page).locator('iframe, video')).toHaveCount(0);
        await context.close();
    });

    test('the server accepts only our uploads and YouTube links as a slide video', async ({ page }) => {
        await page.goto('/admin/carousels');
        const overlay = JSON.stringify({ v: 1, layers: [] });
        for (const video of ['https://vimeo.com/123456789', 'https://example.com/clip.mp4', 'javascript:alert(1)']) {
            const response = await postAction(page, 'carousels.update', { multipart: { id: alphaId, overlay, video } });
            expect(response.status, video).toBe(400);
        }
    });

    test('on a 390x844 phone the slide is 4:5 and the heading sits inside the frame', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await blockYoutube(page);
        await page.goto('/');
        await showSlide(page, GAMMA.headline);

        const hero = await heroOf(page).boundingBox();
        expect(hero).not.toBeNull();
        expect((hero?.width ?? 0) / (hero?.height ?? 1)).toBeCloseTo(0.8, 2);

        const heading = heroOf(page).locator('h2', { hasText: GAMMA.headline });
        await expect(heading).toBeVisible();
        const box = await heading.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual((hero?.x ?? 0) - 0.5);
        expect(box?.y ?? -1).toBeGreaterThanOrEqual((hero?.y ?? 0) - 0.5);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((hero?.x ?? 0) + (hero?.width ?? 0) + 0.5);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((hero?.y ?? 0) + (hero?.height ?? 0) + 0.5);
        // Text is at least 12 px.
        expect(await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);

        // Stacked automatically: the button is below the heading and they do not overlap.
        const button = await heroOf(page).locator('a', { hasText: GAMMA.label }).boundingBox();
        expect(button).not.toBeNull();
        expect(button?.y ?? 0).toBeGreaterThanOrEqual((box?.y ?? 0) + (box?.height ?? 0) - 0.5);
        await context.close();
    });

    test('a mobile override from the designer applies on phones only', async ({ page, browser }) => {
        await blockYoutube(page);
        const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const phonePage = await phone.newPage();
        await blockYoutube(phonePage);
        const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const widePage = await wide.newPage();
        await blockYoutube(widePage);

        const measure = async () => {
            await phonePage.goto('/');
            await showSlide(phonePage, GAMMA.headline);
            const onPhone = await headlineTop(phonePage, GAMMA.headline);
            await widePage.goto('/');
            await showSlide(widePage, GAMMA.headline);
            return { onPhone, onDesktop: await headlineTop(widePage, GAMMA.headline) };
        };
        const before = await measure();

        await page.goto('/admin/carousels');
        await page.getByRole('button', { name: new RegExp(`^Edit slide \\d+ of \\d+: ${GAMMA.headline}`) }).click();
        await page.getByRole('button', { name: 'Mobile', exact: true }).click();
        const stage = page.locator('[data-designer-area] [role="group"][aria-label^="Phone slide canvas"]');
        const stageBox = await stage.boundingBox();
        expect((stageBox?.width ?? 0) / (stageBox?.height ?? 1)).toBeCloseTo(0.8, 2);

        await page.getByRole('button', { name: `Text: ${GAMMA.headline}` }).focus();
        await expect(page.getByTestId('phone-layout')).toContainText('Stacked automatically');
        for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowUp');
        await expect(page.getByTestId('phone-layout')).toContainText('Placed by hand');

        const update = saved(page, 'update');
        await page.keyboard.press('Control+s');
        await update;

        const after = await measure();
        expect(after.onPhone).toBeLessThan(before.onPhone - 5);
        expect(Math.abs(after.onDesktop - before.onDesktop)).toBeLessThan(0.5);

        // Reset to automatic restores the stacked position; hiding removes the heading on phones only.
        await page.getByRole('button', { name: 'Reset to automatic' }).first().click();
        await expect(page.getByTestId('phone-layout')).toContainText('Stacked automatically');
        await page.getByRole('checkbox', { name: 'Hide on phones' }).check();
        const hidden = saved(page, 'update');
        await page.keyboard.press('Control+s');
        await hidden;

        await phonePage.goto('/');
        await expect(heroOf(phonePage).locator('h2', { hasText: GAMMA.headline })).toBeHidden();
        await widePage.goto('/');
        await showSlide(widePage, GAMMA.headline);
        await expect(heroOf(widePage).locator('h2', { hasText: GAMMA.headline })).toBeVisible();

        await phone.close();
        await wide.close();
    });
});

test.describe('department user', () => {
    test('only sees its own slides and cannot edit another department’s slide', async ({ browser }) => {
        const context = await browser.newContext({ storageState: CIT });
        const page = await context.newPage();

        expect((await page.goto('/admin/carousels'))?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: 'Slide designer' })).toBeVisible();
        await expect(page.locator(`[data-slide-id][aria-label*="${RUN}"]`)).toHaveCount(0);
        await expect(page.getByTestId('scope-static')).toBeVisible();

        const overlay = JSON.stringify({ v: 1, layers: [] });
        const update = await postAction(page, 'carousels.update', { multipart: { id: alphaId, overlay } });
        expect(update.status).toBe(403);
        expect(update.text).toContain('FORBIDDEN');

        const remove = await postAction(page, 'carousels.delete', { json: { id: Number(alphaId) } });
        expect(remove.status).toBe(403);

        const reorder = await postAction(page, 'carousels.reorder', { json: { ids: [Number(alphaId)] } });
        expect(reorder.status).toBe(403);
        await context.close();
    });
});

test.describe('cleanup', () => {
    test.use({ storageState: ADMIN });

    test('delete the test slides', async ({ page, browser }) => {
        await page.goto('/admin/carousels');
        for (const headline of [ALPHA.headline, BETA.headline, GAMMA.headline]) {
            await page.getByRole('button', { name: new RegExp(`^Edit slide \\d+ of \\d+: ${headline}`) }).click();
            const position = (
                await page.locator('[aria-current="true"][data-slide-id]').getAttribute('aria-label')
            )?.match(/slide (\d+)/)?.[1];
            await page.getByRole('button', { name: `Actions for slide ${position}` }).click();
            const removed = saved(page, 'delete');
            await page.getByRole('button', { name: 'Delete slide' }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
            await removed;
        }
        expect(await mine(page)).toEqual([]);
        expect((await publicHome(browser)).headings).toEqual([]);
    });
});
