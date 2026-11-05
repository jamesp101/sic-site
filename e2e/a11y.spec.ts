import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEMO_DEPARTMENTS } from '../prisma/demo-data';
import { ADMIN } from './auth-state';

const PAGES = ['/', '/posts', '/downloads', '/contact', `/departments/${DEMO_DEPARTMENTS.cit.slug}`, '/login'];

for (const scheme of ['light', 'dark'] as const) {
    for (const path of PAGES) {
        test(`${path} has no serious axe violations (${scheme})`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: scheme });
            await page.goto(path);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
                .analyze();
            const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        });
    }
}

test('skip link moves focus to main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('a[href="#main"]');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
});

test('keyboard focus is never hidden under the sticky header (WCAG 2.4.11)', async ({ page }) => {
    await page.goto('/posts');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Start from the last tabbable element, then walk backwards to the top of the page.
    await page.keyboard.press('Shift+Tab');
    const covered: string[] = [];
    for (let step = 0; step < 200; step++) {
        // Focus scrolling is smooth: measure once the page has stopped moving.
        await page.evaluate(() => {
            const { promise, resolve } = Promise.withResolvers<void>();
            let last = -1;
            let still = 0;
            const tick = () => {
                still = window.scrollY === last ? still + 1 : 0;
                last = window.scrollY;
                if (still >= 5) resolve();
                else requestAnimationFrame(tick);
            };
            tick();
            return promise;
        });
        const state = await page.evaluate(() => {
            const header = document.querySelector('[data-site-header]')!;
            const active = document.activeElement as HTMLElement;
            if (header.contains(active) || active === document.body) return { done: true as const };
            const box = active.getBoundingClientRect();
            return {
                done: false as const,
                under: box.top < header.getBoundingClientRect().bottom - 0.5,
                name: `${active.tagName.toLowerCase()} ${(active.textContent ?? '').trim().slice(0, 40)}`,
            };
        });
        if (state.done) break;
        if (state.under) covered.push(state.name);
        await page.keyboard.press('Shift+Tab');
    }
    expect(covered).toEqual([]);
});

test('a printed Post shows only the article, black on white', async ({ page }) => {
    await page.goto('/posts');
    const first = page.locator('a[href^="/posts/"]').first();
    await page.goto((await first.getAttribute('href'))!);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-site-header]')).toBeHidden();
    await expect(page.locator('footer')).toBeHidden();
    await expect(page.locator('a[href="#main"]')).toBeHidden();
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeHidden();
    const colours = await page.evaluate(() => {
        const h1 = document.querySelector('h1')!;
        return [getComputedStyle(h1).color, getComputedStyle(document.body).backgroundColor];
    });
    expect(colours).toEqual(['rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
});

test.describe('admin', () => {
    test.use({ storageState: ADMIN });

    test('skip link moves focus to the main landmark', async ({ page }) => {
        await page.goto('/admin/posts');
        await page.keyboard.press('Tab');
        const skip = page.getByRole('link', { name: 'Skip to main content' });
        await expect(skip).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('main#main')).toBeFocused();
    });
});
