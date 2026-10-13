import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';
const SEAL = path.resolve('public/sic-seal.png');

// Unique per run so retries and other specs never collide with these slides.
const RUN = Date.now().toString(36);
const ALPHA = { headline: `E2E Alpha ${RUN}`, label: `E2E Alpha Button ${RUN}`, href: '/posts' };
const BETA = { headline: `E2E Beta ${RUN}`, label: `E2E Beta Button ${RUN}`, href: '/downloads' };

let alphaId = '';

const saved = (page: Page, action: string) =>
    page.waitForResponse((r) => r.url().includes(`/_actions/carousels.${action}`) && r.ok());

/** Clicks "Add slide", retrying until the island has hydrated and the new slide's Create button shows. */
async function addSlide(page: Page) {
    await expect(async () => {
        await page.getByRole('button', { name: 'Add slide' }).first().click({ timeout: 2000 });
        await expect(page.getByRole('button', { name: 'Create slide' })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
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
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
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
    await context.close();
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
        const origin = new URL(page.url()).origin;
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
            const response = await page.request.post('/_actions/carousels.update', {
                headers: { Origin: origin },
                multipart: { id: alphaId, overlay: layer(bad) },
            });
            expect(response.status(), `${JSON.stringify(bad)} id=${alphaId} ${await response.text()}`).toBe(400);
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
        const origin = new URL(page.url()).origin;
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
        const response = await page.request.post('/_actions/carousels.update', {
            headers: { Origin: origin },
            multipart: { id: alphaId, overlay },
        });
        expect(response.status()).toBe(200);

        // Saved in the new form: the button is Large and the heading Medium.
        await page.goto('/admin/carousels');
        await tile(page, ALPHA.headline).click();
        await page.getByRole('button', { name: `Button: ${ALPHA.label}`, exact: true }).click();
        await expect(page.getByRole('group', { name: 'Size' }).getByRole('button', { name: 'Large' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        const context = await browser.newContext({ javaScriptEnabled: false });
        const home = await context.newPage();
        await home.goto('/');
        const links = home.locator('section[aria-roledescription="carousel"] a', { hasText: ALPHA.label });
        await expect(links).toHaveCount(2);
        const [a, b] = await links.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
        expect(a).toBeGreaterThan(10);
        expect(Math.abs(a - b)).toBeLessThan(0.5);
        await context.close();
    });
});

test.describe('department user', () => {
    test('only sees its own slides and cannot edit another department’s slide', async ({ browser }) => {
        const context = await browser.newContext({ storageState: CIT });
        const page = await context.newPage();

        expect((await page.goto('/admin/carousels'))?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: 'Slide designer' })).toBeVisible();
        await expect(page.locator(`[data-slide-id][aria-label*="${RUN}"]`)).toHaveCount(0);
        await expect(page.getByLabel('Show slides for')).toHaveCount(0);

        const origin = new URL(page.url()).origin;
        const overlay = JSON.stringify({ v: 1, layers: [] });
        const update = await page.request.post('/_actions/carousels.update', {
            headers: { Origin: origin },
            multipart: { id: alphaId, overlay },
        });
        expect(update.status()).toBe(403);
        expect(await update.text()).toContain('FORBIDDEN');

        const remove = await page.request.post('/_actions/carousels.delete', {
            headers: { Origin: origin },
            data: { id: Number(alphaId) },
        });
        expect(remove.status()).toBe(403);

        const reorder = await page.request.post('/_actions/carousels.reorder', {
            headers: { Origin: origin },
            data: { ids: [Number(alphaId)] },
        });
        expect(reorder.status()).toBe(403);
        await context.close();
    });
});

test.describe('cleanup', () => {
    test.use({ storageState: ADMIN });

    test('delete the test slides', async ({ page, browser }) => {
        await page.goto('/admin/carousels');
        for (const headline of [ALPHA.headline, BETA.headline]) {
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
