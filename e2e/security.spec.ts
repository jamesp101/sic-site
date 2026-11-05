import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { DEMO_DEPARTMENTS } from '../prisma/demo-data';
import { ADMIN } from './auth-state';
import { UPLOADS } from './env';
import { SEAL_BYTES } from './support';

const PUBLIC_PAGES = ['/', '/posts', '/downloads', '/contact', `/departments/${DEMO_DEPARTMENTS.cit.slug}`];
const ADMIN_PAGES = ['/dashboard', '/admin/posts', '/admin/posts/create', '/admin/carousels', '/admin/departments'];

/** Collects every CSP violation the document reports (console message or `securitypolicyviolation` event). */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
    const messages: string[] = [];
    page.on('console', (message) => {
        if (/content security policy/i.test(message.text())) messages.push(message.text());
    });
    await page.addInitScript(() => {
        Reflect.set(window, '__violations', []);
        document.addEventListener('securitypolicyviolation', (event) => {
            const list = Reflect.get(window, '__violations') as string[];
            list.push(`${event.violatedDirective} ${event.blockedURI} ${event.sample}`.trim());
        });
    });
    return async () => [
        ...messages,
        ...(await page.evaluate(() => (Reflect.get(window, '__violations') as string[] | undefined) ?? [])),
    ];
}

const scriptSrcOf = (policy: string | undefined) =>
    policy
        ?.split(';')
        .map((directive) => directive.trim())
        .find((directive) => directive.startsWith('script-src '));

test.describe('Content-Security-Policy', () => {
    test('public pages allow only same-origin and hashed scripts, and still render and hydrate', async ({ page }) => {
        const violations = await watchViolations(page);
        for (const path of PUBLIC_PAGES) {
            const response = await page.goto(path);
            const policy = response?.headers()['content-security-policy'];
            const scriptSrc = scriptSrcOf(policy);
            expect(scriptSrc, path).toMatch(/^script-src 'self' 'sha256-/);
            expect(scriptSrc, path).not.toContain('unsafe-inline');
            expect(policy, path).toContain("frame-ancestors 'none'");
            await expect(page.locator('h1').first(), path).toBeVisible();
            // Every island that hydrates on load has done so (Astro drops `ssr` once it is interactive).
            await expect(page.locator('astro-island[client="load"][ssr]'), path).toHaveCount(0);
            expect(await violations(), path).toEqual([]);
        }
    });

    test('the theme bootstrap runs under the policy', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        const violations = await watchViolations(page);
        await page.goto('/');
        await expect(page.locator('html')).toHaveClass(/dark/);
        expect(await violations()).toEqual([]);
    });

    test.describe('admin', () => {
        test.use({ storageState: ADMIN });

        test('admin pages hydrate and client-side navigation runs no blocked script', async ({ page }) => {
            const violations = await watchViolations(page);
            await page.goto(ADMIN_PAGES[0]);
            for (const path of ADMIN_PAGES.slice(1)) {
                const response = await page.goto(path);
                expect(scriptSrcOf(response?.headers()['content-security-policy']), path).not.toContain(
                    'unsafe-inline',
                );
                await expect(page.locator('h1').first(), path).toBeVisible();
                await expect(page.locator('astro-island[client="load"][ssr]'), path).toHaveCount(0, {
                    timeout: 15_000,
                });
            }
            // ClientRouter swaps pages inside one document, which keeps the first page's policy.
            await page.goto('/dashboard');
            const sidebar = page.locator('[data-sidebar="content"]');
            await sidebar.getByRole('link', { name: 'Posts', exact: true }).click();
            await expect(page).toHaveURL(/\/admin\/posts$/);
            await sidebar.getByRole('link', { name: 'Departments', exact: true }).click();
            await expect(page).toHaveURL(/\/admin\/departments$/);
            await expect(page.getByRole('heading', { level: 1, name: 'Departments' })).toBeVisible();
            expect(await violations()).toEqual([]);
        });
    });
});

test.describe('anonymous actions', () => {
    const post = (request: APIRequestContext, origin: string | undefined, name: string) =>
        request.post(`/_actions/${name}`, { headers: { origin: origin ?? '' }, multipart: { title: 'x' } });

    test('a signed-out call to a private action is answered 401 in the action error shape', async ({
        request,
        baseURL,
    }) => {
        for (const name of ['posts.create', 'users.create', 'account.deleteUser', 'downloads.create']) {
            const response = await post(request, baseURL, name);
            expect(response.status(), name).toBe(401);
            expect(await response.json(), name).toMatchObject({ type: 'AstroActionError', code: 'UNAUTHORIZED' });
            expect(response.headers()['cache-control'], name).toBe('no-store');
        }
    });

    test('the public contact action is still reachable (and validates its input)', async ({ request, baseURL }) => {
        const response = await post(request, baseURL, 'contact.send');
        expect(response.status()).toBe(400);
        expect(await response.json()).toMatchObject({ type: 'AstroActionInputError' });
    });
});

test.describe('Better Auth paths the app does not use', () => {
    for (const path of ['/api/auth/change-password', '/api/auth/update-user', '/api/auth/delete-user']) {
        test(`${path} is not served`, async ({ request }) => {
            const response = await request.post(path, { data: {}, headers: { origin: 'http://localhost' } });
            expect(response.status()).toBe(404);
        });
    }
});

test.describe('HTTP caching (Node server)', () => {
    test('public pages are cacheable, tagged and answered with 304; text is compressed', async ({ request }) => {
        const first = await request.get('/posts', { headers: { 'accept-encoding': 'gzip' } });
        expect(first.headers()['cache-control']).toBe('public, max-age=60, s-maxage=60, stale-while-revalidate=600');
        expect(first.headers()['content-encoding']).toBe('gzip');
        expect(first.headers()['vary']).toContain('Accept-Encoding');
        const etag = first.headers()['etag'];
        expect(etag).toMatch(/^W\/"/);

        const again = await request.get('/posts', { headers: { 'if-none-match': etag } });
        expect(again.status()).toBe(304);
        expect(again.headers()['etag']).toBe(etag);
        expect(again.headers()['cache-control']).toContain('s-maxage=60');
    });

    test('signed-in pages are never tagged or cached', async ({ browser }) => {
        const context = await browser.newContext({ storageState: ADMIN });
        const response = await context.request.get('/admin/posts');
        expect(response.headers()['cache-control']).toBe('no-store');
        expect(response.headers()['etag']).toBeUndefined();
        await context.close();
    });

    test('files from public/ are cached for a day, built assets for a year', async ({ request, page }) => {
        const seal = await request.get('/sic-seal.png');
        expect(seal.headers()['cache-control']).toBe('public, max-age=86400');
        const stylesheet = await page
            .goto('/')
            .then(() => page.locator('link[rel="stylesheet"]').first().getAttribute('href'));
        const built = await request.get(stylesheet!);
        expect(built.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    test.describe('stored files', () => {
        test.use({ storageState: ADMIN });

        test('answer If-None-Match and If-Modified-Since with 304 and are cached as immutable', async ({ request }) => {
            const uploaded = await request.post('/api/admin/uploads/image', {
                multipart: { kind: 'content', image: { name: 'seal.png', mimeType: 'image/png', buffer: SEAL_BYTES } },
            });
            expect(uploaded.ok()).toBe(true);
            const { url } = (await uploaded.json()) as { url: string };

            const file = await request.get(url);
            expect(file.status()).toBe(200);
            expect(file.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
            const { etag, 'last-modified': modified } = file.headers();
            expect(etag).toMatch(/^W\/"/);
            expect(file.headers()['content-encoding']).toBeUndefined();

            const byEtag = await request.get(url, { headers: { 'if-none-match': etag } });
            expect(byEtag.status()).toBe(304);
            expect(await byEtag.body()).toHaveLength(0);
            const byDate = await request.get(url, { headers: { 'if-modified-since': modified } });
            expect(byDate.status()).toBe(304);
            const stale = await request.get(url, { headers: { 'if-none-match': 'W/"other"' } });
            expect(stale.status()).toBe(200);
        });
    });
});

test.describe('uploaded images', () => {
    test.use({ storageState: ADMIN });

    test('an SVG sent as a PNG is rejected after sign-in and stores nothing', async ({ request }) => {
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>',
        );
        const response = await request.post('/api/admin/uploads/image', {
            multipart: { kind: 'content', image: { name: 'logo.png', mimeType: 'image/png', buffer: svg } },
        });
        expect(response.status()).toBe(400);
        expect(await response.json()).toMatchObject({ message: expect.stringContaining('could not be read') });
    });

    test('a signed-out upload is refused', async ({ playwright, baseURL }) => {
        const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
        const response = await anonymous.post('/api/admin/uploads/image', {
            multipart: { kind: 'content', image: { name: 'seal.png', mimeType: 'image/png', buffer: SEAL_BYTES } },
        });
        expect(response.status()).toBe(401);
        await anonymous.dispose();
    });
});

test.describe('request body limit of the Node server', () => {
    test.use({ storageState: ADMIN });

    test('still accepts the largest upload: a 100 MB video PUT', async ({ request }) => {
        const size = 100 * 1024 * 1024;
        const grant = await request.post('/api/admin/uploads/video', {
            data: { fileName: 'big.mp4', contentType: 'video/mp4', size },
        });
        expect(grant.ok(), await grant.text()).toBe(true);
        const { key, url, contentType } = (await grant.json()) as { key: string; url: string; contentType: string };

        const put = await request.put(url, { headers: { 'Content-Type': contentType }, data: Buffer.alloc(size, 7) });
        expect(put.status(), await put.text()).toBe(204);
        const file = path.resolve(UPLOADS, key);
        expect(fs.statSync(file).size).toBe(size);
        fs.rmSync(file);
    });
});
