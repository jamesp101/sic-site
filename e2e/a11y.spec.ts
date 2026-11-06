import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_DEPARTMENTS } from '../prisma/demo-data';
import { postAction } from './actions';
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

/** After the skip link, the next Tab lands inside <main> (the browser moves its focus starting point there). */
async function expectSkipLinkReachesMain(page: Page) {
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('main#main')!.contains(document.activeElement))).toBe(true);
}

test('skip link moves keyboard focus into main', async ({ page }) => {
    await page.goto('/');
    await expectSkipLinkReachesMain(page);
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

test.describe('printing accordions', () => {
    test.use({ storageState: ADMIN });

    test('closed accordions print open and close again afterwards', async ({ page }) => {
        const title = `Print accordion ${Date.now().toString(36)}`;
        const content = JSON.stringify({
            type: 'sic-blocks',
            version: 1,
            blocks: [
                {
                    id: 'acc1',
                    type: 'accordion',
                    props: { items: [{ title: 'Printed question', body: 'Printed answer text.' }] },
                },
            ],
        });
        await page.goto('/admin/posts');
        const created = await postAction<{ id: number }>(page, 'posts.create', {
            multipart: { title, content, type: 'article', isFeatured: 'false' },
        });
        expect(created.ok, created.text).toBe(true);
        try {
            await page.goto('/posts');
            await page.getByRole('link', { name: title }).first().click();
            const answer = page.getByText('Printed answer text.');
            const accordion = page.locator('details', { hasText: 'Printed question' });
            await expect(accordion).not.toHaveAttribute('open', '');
            await expect(answer).toBeHidden();

            // Print media alone (what a browser without JavaScript gets) shows the answer.
            await page.emulateMedia({ media: 'print' });
            await expect(answer).toBeVisible();
            await page.emulateMedia({ media: 'screen' });
            await expect(answer).toBeHidden();

            // With JavaScript, `beforeprint` opens the accordion and `afterprint` restores it.
            await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
            await expect(accordion).toHaveAttribute('open', '');
            await expect(answer).toBeVisible();
            await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
            await expect(accordion).not.toHaveAttribute('open', '');
        } finally {
            await postAction(page, 'posts.delete', { json: { id: created.data.id } });
        }
    });
});

test.describe('admin', () => {
    test.use({ storageState: ADMIN });

    test('skip link moves keyboard focus into main', async ({ page }) => {
        await page.goto('/admin/posts');
        await expectSkipLinkReachesMain(page);
    });
});
