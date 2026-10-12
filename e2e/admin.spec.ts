import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';

test.describe('as superadmin', () => {
    test.use({ storageState: ADMIN });

    test('admin navigation swaps views without a full page load', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/dashboard');
        // A full document load would wipe this marker; client-side navigation keeps it.
        await page.evaluate(() => Reflect.set(window, '__marker', 1));

        let documentRequests = 0;
        page.on('request', (request) => {
            if (request.resourceType() === 'document') documentRequests++;
        });

        const sidebar = page.locator('[data-sidebar="content"]');
        await sidebar.getByRole('link', { name: 'Departments', exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/departments$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Departments' })).toBeVisible();
        await expect(page).toHaveTitle(/Manage Departments/);

        // GET filter forms are swapped in too.
        await page.getByLabel('Search departments').fill('business');
        await page.getByRole('button', { name: 'Filter' }).click();
        await expect(page).toHaveURL(/q=business/);
        await expect(page.locator('tbody tr')).toHaveCount(1);

        await sidebar.getByRole('link', { name: 'Posts', exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/posts$/);
        await page.goBack();
        await expect(page).toHaveURL(/q=business/);
        // Back/forward changes the URL before the swap; wait for the restored view.
        await expect(page.getByRole('heading', { level: 1, name: 'Departments' })).toBeVisible();

        // Hover prefetches the next view; the click then swaps without another request.
        const requests: string[] = [];
        page.on('request', (request) => {
            const url = new URL(request.url());
            requests.push(url.pathname + url.search);
        });
        // "Users" is only linked from the sidebar, so no other hover/focus can have prefetched it.
        const users = sidebar.getByRole('link', { name: 'Users', exact: true });
        await users.hover();
        await expect.poll(() => requests.filter((p) => p === '/admin/users').length).toBe(1);
        await users.click();
        await expect(page).toHaveURL(/\/admin\/users$/);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(/Users/);
        expect(requests.filter((p) => p === '/admin/users').length).toBe(1);

        expect(await page.evaluate(() => Reflect.get(window, '__marker'))).toBe(1);
        expect(documentRequests).toBe(0);
        // Theme class survives the swaps.
        await expect(page.locator('html')).toHaveClass(/dark/);
    });

    test('creates a post with a highlight image and it is visible publicly', async ({ page }) => {
        const title = `E2E post ${Date.now()}`;
        await page.goto('/admin/posts/create');
        await page.getByLabel('Post title').fill(title);
        await page.getByRole('button', { name: 'Add Text', exact: true }).click();
        await page.getByLabel('Text', { exact: true }).fill('Body from the end-to-end test.');
        await page.locator('#highlightImage').setInputFiles(path.resolve('public/sic-seal.png'));
        await page.getByRole('button', { name: 'Apply Crop' }).click();
        // Hover the sidebar "Posts" link first so a pre-save copy of the list sits in the prefetch cache.
        const prefetched = page.waitForResponse((res) => res.url().endsWith('/admin/posts'));
        await page.locator('[data-sidebar="content"]').getByRole('link', { name: 'Posts', exact: true }).hover();
        await prefetched;
        await page.getByRole('button', { name: 'Publish post' }).click();
        await expect(page).toHaveURL(/\/admin\/posts$/);
        // The post-save navigation must fetch fresh data, not reuse the prefetched list.
        await expect(page.locator('main')).toContainText(title);

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
        // Four axe scans (the editor page is heavy) exceed the default 30 s under parallel load.
        test.slow();
        for (const route of ['/dashboard', '/admin/posts', '/admin/posts/create', '/admin/departments']) {
            await page.goto(route);
            const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
            const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            expect(
                serious.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
            ).toEqual([]);
        }
    });

    test('departments table searches, filters and sorts on the server', async ({ page }) => {
        const names = () => page.locator('tbody tr td:first-child a').allTextContents();

        await page.goto('/admin/departments?q=business');
        expect(await names()).toEqual(['College of Business Administration']);

        await page.goto('/admin/departments?sort=name&dir=desc');
        const desc = await names();
        expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a)));
        await expect(page.locator('th[aria-sort="descending"]')).toHaveText(/Department/);

        // Sorting by member count orders rows by the visible count.
        await page.goto('/admin/departments?sort=members&dir=desc');
        const counts = (await page.locator('tbody tr td:nth-child(2)').allTextContents()).map(Number);
        expect(counts).toEqual([...counts].sort((a, b) => b - a));

        // Seeded College of Education has no org chart members yet.
        await page.goto('/admin/departments?members=no');
        expect(await names()).toEqual(['College of Education']);
        await page.goto('/admin/departments?members=yes');
        expect(await names()).not.toContain('College of Education');
        await page.goto('/admin/departments?q=no-such-department');
        await expect(page.getByText('No departments match your filters.')).toBeVisible();
        await page.getByRole('link', { name: 'Reset' }).click();
        await expect(page).toHaveURL(/\/admin\/departments$/);
    });
});

test.describe('as department user', () => {
    test.use({ storageState: CIT });

    test('cannot open superadmin screens', async ({ page }) => {
        expect((await page.goto('/admin/users'))?.status()).toBe(403);
    });

    test('departments table only lists their own department, even with filters', async ({ page }) => {
        const names = page.locator('tbody tr td:first-child a');
        await page.goto('/admin/departments');
        await expect(names).toHaveText(['College of Information Technology']);
        await page.goto('/admin/departments?q=business');
        await expect(names).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Add department' })).toHaveCount(0);
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

test('login works without JavaScript and never puts credentials in the URL', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));

    await page.goto('/login?redirect=/admin/posts');
    await page.getByLabel(/email/i).fill('admin@email.com');
    await page.getByLabel(/^password$/i).fill('not-the-password');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByRole('alert')).toContainText('These credentials do not match our records.');
    await expect(page.getByLabel(/email/i)).toHaveValue('admin@email.com');

    await page.getByLabel(/^password$/i).fill(process.env.SEED_SUPERADMIN_PASSWORD ?? 'password');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/admin\/posts$/);

    expect(urls.filter((url) => /password=|not-the-password/.test(url))).toEqual([]);
    await context.close();
});
