import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const ADMIN = 'e2e/.auth/admin.json';
const CIT = 'e2e/.auth/cit.json';

test.describe('as superadmin', () => {
    test.use({ storageState: ADMIN });

    test('creates a post with a highlight image and it is visible publicly', async ({ page }) => {
        const title = `E2E post ${Date.now()}`;
        await page.goto('/admin/posts/create');
        await page.getByLabel('Post title').fill(title);
        await page.locator('.cm-content').click();
        await page.keyboard.type('Body from the end-to-end test.');
        await page.locator('#highlightImage').setInputFiles(path.resolve('public/sic-seal.png'));
        await page.getByRole('button', { name: 'Apply Crop' }).click();
        await page.getByRole('button', { name: 'Publish post' }).click();
        await expect(page).toHaveURL(/\/admin\/posts$/);

        await page.goto(`/posts?search=${encodeURIComponent(title)}`);
        const link = page.getByRole('link', { name: title }).first();
        await expect(link).toBeVisible();

        await link.click();
        await expect(page.locator('h1')).toHaveText(title);
        const src = await page.locator('main img[src^="/storage/posts/"]').first().getAttribute('src');
        expect(src).toBeTruthy();
        const image = await page.request.get(src!);
        expect(image.status()).toBe(200);
        expect(image.headers()['content-type']).toMatch(/^image\//);
    });

    test('admin screens have no serious axe violations', async ({ page }) => {
        for (const route of ['/dashboard', '/admin/posts', '/admin/posts/create']) {
            await page.goto(route);
            const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
            const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            expect(
                serious.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
            ).toEqual([]);
        }
    });
});

test.describe('as department user', () => {
    test.use({ storageState: CIT });

    test('cannot open superadmin screens', async ({ page }) => {
        expect((await page.goto('/admin/users'))?.status()).toBe(403);
    });

    test('cannot edit another department post or see it in their list', async ({ browser, page }) => {
        const admin = await browser.newContext({ storageState: ADMIN });
        const adminPage = await admin.newPage();
        await adminPage.goto('/admin/posts?q=CBA');
        const editHref = await adminPage
            .locator('a[href^="/admin/posts/"][href$="/edit"]')
            .first()
            .getAttribute('href');
        await admin.close();
        expect(editHref).toBeTruthy();

        expect((await page.goto(editHref!))?.status()).toBe(403);
        await page.goto('/admin/posts');
        await expect(page.locator('main')).not.toContainText(/CBA Students/i);
    });
});

test('wrong password shows an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@email.com');
    await page.getByLabel(/^password$/i).fill('not-the-password');
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert')).toBeVisible();
});
