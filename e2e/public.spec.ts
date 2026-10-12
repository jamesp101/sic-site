import { expect, test } from '@playwright/test';

test('home → department → post navigation works with server-rendered links', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);

    await page.goto('/departments/cit');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toContainText(/Information Technology/i);

    await page.goto('/posts');
    const firstPost = page.locator('main a[href^="/posts/"]').first();
    const href = await firstPost.getAttribute('href');
    expect(href).toBeTruthy();
    const post = await page.goto(href!);
    expect(post?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
});

test('public pages render for every route', async ({ page }) => {
    for (const path of ['/', '/posts', '/downloads', '/contact', '/departments/cba', '/departments/coe']) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBe(200);
        await expect(page.locator('main#main'), path).toBeVisible();
    }
});

test('unknown post and department return 404', async ({ page }) => {
    expect((await page.goto('/posts/does-not-exist'))?.status()).toBe(404);
    expect((await page.goto('/departments/does-not-exist'))?.status()).toBe(404);
});

test('post filters work without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/posts?type=event');
    const pills = page.locator('main [data-post-type]');
    const types = await pills.evaluateAll((els) => els.map((el) => el.getAttribute('data-post-type')));
    expect(types.every((t) => t === 'event')).toBe(true);
    await context.close();
});

test('guests are redirected from admin areas', async ({ page }) => {
    for (const path of ['/dashboard', '/admin/posts', '/settings/profile']) {
        await page.goto(path);
        await expect(page, path).toHaveURL(/\/login\?redirect=/);
    }
});
