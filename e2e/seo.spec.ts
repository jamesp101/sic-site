import { expect, test } from '@playwright/test';

const PAGES = ['/', '/posts', '/downloads', '/contact', '/departments/cit'];

test('each public page has unique title, description, canonical and OG tags', async ({ page }) => {
    const titles = new Set<string>();
    for (const path of PAGES) {
        await page.goto(path);
        const title = await page.title();
        expect(title, path).not.toBe('');
        titles.add(title);
        await expect(page.locator('meta[name="description"]'), path).toHaveAttribute('content', /.{50,}/);
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(new URL(canonical!).pathname, path).toBe(path);
        await expect(page.locator('meta[property="og:title"]'), path).toHaveCount(1);
        await expect(page.locator('meta[property="og:image"]'), path).toHaveCount(1);
    }
    expect(titles.size).toBe(PAGES.length);
});

test('canonical drops filter query params and filtered views are noindex', async ({ page }) => {
    await page.goto('/posts?type=event&search=x');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(new URL(canonical!).search).toBe('');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('home exposes CollegeOrUniversity structured data', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.flatMap((b) => {
        const json = JSON.parse(b);
        return (Array.isArray(json) ? json : [json])
            .flatMap((j) => j['@graph'] ?? j)
            .map((j: { '@type': string }) => j['@type']);
    });
    expect(types).toContain('CollegeOrUniversity');
});

test('post pages expose article or event structured data and breadcrumbs', async ({ page }) => {
    await page.goto('/posts');
    const href = await page.locator('main a[href^="/posts/"]').first().getAttribute('href');
    await page.goto(href!);
    const text = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n');
    expect(text).toMatch(/"(NewsArticle|Event)"/);
    expect(text).toContain('"BreadcrumbList"');
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
});

test('sitemap lists public pages, departments and posts', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const xml = await res.text();
    expect(xml).toContain('<urlset');
    expect(xml).toMatch(/<loc>[^<]+\/departments\/cit<\/loc>/);
    expect(xml).toMatch(/<loc>[^<]+\/posts\/[^<]+<\/loc>/);
    expect(xml).not.toMatch(/\/admin|\/dashboard|\/login/);
});

test('robots.txt blocks private areas and points at the sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    for (const path of ['/admin', '/dashboard', '/settings', '/api/']) expect(body).toContain(`Disallow: ${path}`);
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
});

test('rss feed is valid RSS 2.0', async ({ request }) => {
    const res = await request.get('/rss.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<item>');
});

test('private pages send noindex', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.headers()['x-robots-tag']).toContain('noindex');
});

test('public pages are cacheable, private ones are not', async ({ request }) => {
    expect((await request.get('/')).headers()['cache-control']).toContain('public');
    expect((await request.get('/login')).headers()['cache-control']).toBe('no-store');
});
