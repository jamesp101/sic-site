import { expect, test } from '@playwright/test';

import { DEMO_DEPARTMENTS, DEMO_POSTS } from '../prisma/demo-data';
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

test('page sections line up with the header container on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ['/', `/departments/${DEMO_DEPARTMENTS.cit.slug}`]) {
        await page.goto(path);
        const headerLeft = await page
            .locator('[data-site-header] > div')
            .first()
            .evaluate((el) => {
                const style = getComputedStyle(el);
                return el.getBoundingClientRect().left + parseFloat(style.paddingLeft);
            });
        const sections = page.locator('main section[data-content-section] > div');
        expect(await sections.count(), path).toBeGreaterThan(0);
        for (const box of await sections.evaluateAll((els) =>
            els.map((el) => {
                const style = getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                const content = el.lastElementChild!.getBoundingClientRect();
                return {
                    left: rect.left + parseFloat(style.paddingLeft),
                    innerWidth: rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
                    contentWidth: content.width,
                };
            }),
        )) {
            expect(Math.abs(box.left - headerLeft), path).toBeLessThan(1);
            // The reading measure applies per text element, never to the whole content, so grids, cards and
            // centred text span (and centre on) the full container.
            expect(Math.abs(box.contentWidth - box.innerWidth), path).toBeLessThan(1);
        }
    }
});

test('a Legacy Markdown Post caps its paragraphs at the reading measure', async ({ page }) => {
    await page.goto('/posts');
    await page.locator('main a[href^="/posts/"]', { hasText: DEMO_POSTS.enrolment.title }).first().click();
    const paragraph = page.locator('article [data-sic-markdown] > p').first();
    await expect(paragraph).toBeVisible();
    const { width, measure, column } = await paragraph.evaluate((el) => {
        const probe = document.createElement('div');
        probe.style.width = 'var(--measure)';
        probe.style.height = '0';
        el.parentElement!.appendChild(probe);
        const measure = probe.getBoundingClientRect().width;
        probe.remove();
        return {
            width: el.getBoundingClientRect().width,
            measure,
            column: el.parentElement!.getBoundingClientRect().width,
        };
    });
    expect(width).toBeLessThanOrEqual(measure + 1);
    expect(measure).toBeLessThan(column);
});
