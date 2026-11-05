import { expect, test } from '@playwright/test';

import { DEMO_DEPARTMENTS } from '../prisma/demo-data';
import { visitorPage } from './support';

test('home → department → post navigation works with server-rendered links', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);

    await page.goto(`/departments/${DEMO_DEPARTMENTS.cit.slug}`);
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
    for (const path of [
        '/',
        '/posts',
        '/downloads',
        '/contact',
        `/departments/${DEMO_DEPARTMENTS.cba.slug}`,
        `/departments/${DEMO_DEPARTMENTS.coe.slug}`,
    ]) {
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
    const page = await visitorPage(browser);
    await page.goto('/posts?type=event');
    const pills = page.locator('main [data-post-type]');
    const types = await pills.evaluateAll((els) => els.map((el) => el.getAttribute('data-post-type')));
    expect(types.every((t) => t === 'event')).toBe(true);
    await page.context().close();
});

test('post filters apply on Enter or Apply, never while typing or selecting', async ({ page }) => {
    await page.goto('/posts');
    const search = page.getByRole('searchbox', { name: 'Search posts' });
    await search.pressSequentially('zzz-no-such-post', { delay: 20 });
    await page.getByLabel('Sort by').selectOption('oldest');
    await page.waitForTimeout(800);
    expect(new URL(page.url()).search).toBe('');

    await search.press('Enter');
    await expect(page).toHaveURL(/search=zzz-no-such-post/);
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.getByText('No posts found')).toBeVisible();

    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/search=zzz-no-such-post/);
});

test('guests are redirected from admin areas', async ({ page }) => {
    for (const path of ['/dashboard', '/admin/posts', '/settings/profile']) {
        await page.goto(path);
        await expect(page, path).toHaveURL(/\/login\?redirect=/);
    }
});
