import { describe, expect, it } from 'vite-plus/test';
import {
    anonymousActionResponse,
    isPublicPage,
    isScopedPath,
    loginRedirect,
    payloadTooLargeResponse,
    rejectsAnonymousAction,
    rejectsLargeAnonymousBody,
    responseHeaders,
} from './request-policy';

const CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const BASE = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};
const PUBLIC_CACHE = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600';
const HSTS = 'max-age=31536000; includeSubDomains';
const NOINDEX = 'noindex, nofollow';

const headersFor = (
    path: string,
    opts: { method?: string; signedIn?: boolean; cc?: boolean; csp?: boolean; siteHttps?: boolean } = {},
) =>
    responseHeaders({
        method: opts.method ?? 'GET',
        url: new URL(path, 'http://localhost'),
        signedIn: opts.signedIn ?? false,
        siteIsHttps: opts.siteHttps ?? false,
        hasCacheControl: opts.cc ?? false,
        hasContentSecurityPolicy: opts.csp ?? false,
    });

describe('responseHeaders', () => {
    const cases: [string, Record<string, string>, Record<string, string>][] = [
        ['/', headersFor('/'), { 'Cache-Control': PUBLIC_CACHE, 'Content-Security-Policy': CSP, ...BASE }],
        ['/posts', headersFor('/posts'), { 'Cache-Control': PUBLIC_CACHE, 'Content-Security-Policy': CSP, ...BASE }],
        [
            '/login',
            headersFor('/login'),
            { 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX, 'Content-Security-Policy': CSP, ...BASE },
        ],
        [
            '/admin/posts',
            headersFor('/admin/posts', { signedIn: true }),
            { 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX, 'Content-Security-Policy': CSP, ...BASE },
        ],
        ['/storage/x.webp', headersFor('/storage/x.webp'), { ...BASE }],
        [
            '/api/admin/uploads/image',
            headersFor('/api/admin/uploads/image', { method: 'POST', signedIn: true }),
            { 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX, 'Content-Security-Policy': CSP, ...BASE },
        ],
        [
            '/sitemap.xml',
            headersFor('/sitemap.xml'),
            { 'Cache-Control': PUBLIC_CACHE, 'Content-Security-Policy': CSP, ...BASE },
        ],
        [
            'non-GET public page',
            headersFor('/contact', { method: 'POST' }),
            { 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, ...BASE },
        ],
        [
            'signed-in GET on a public page',
            headersFor('/posts', { signedIn: true }),
            { 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, ...BASE },
        ],
        ['asset under /_astro', headersFor('/_astro/a.js'), { 'Content-Security-Policy': CSP, ...BASE }],
        ['response with its own Cache-Control and CSP', headersFor('/posts', { cc: true, csp: true }), { ...BASE }],
    ];

    it.each(cases)('%s', (_name, actual, expected) => {
        expect(actual).toEqual(expected);
    });

    it('adds HSTS (with subdomains) when the request or SITE_URL is https, never for plain http', () => {
        const https = responseHeaders({
            method: 'GET',
            url: new URL('https://example.org/'),
            signedIn: false,
            siteIsHttps: false,
            hasCacheControl: false,
            hasContentSecurityPolicy: false,
        });
        expect(https['Strict-Transport-Security']).toBe(HSTS);
        // Behind a TLS-terminating proxy the request URL is http://, but SITE_URL says https.
        expect(headersFor('/', { siteHttps: true })['Strict-Transport-Security']).toBe(HSTS);
        expect(headersFor('/storage/x.webp', { siteHttps: true })['Strict-Transport-Security']).toBe(HSTS);
        expect(headersFor('/')['Strict-Transport-Security']).toBeUndefined();
    });

    it('keeps action calls private and out of search indexes', () => {
        expect(headersFor('/_actions/posts.create', { method: 'POST' })).toEqual({
            'Cache-Control': 'no-store',
            'X-Robots-Tag': NOINDEX,
            'Content-Security-Policy': CSP,
            ...BASE,
        });
    });
});

describe('loginRedirect', () => {
    const redirect = (path: string, signedIn: boolean) => loginRedirect(new URL(path, 'http://localhost'), signedIn);

    it('sends anonymous visitors of protected routes to login, keeping the target', () => {
        expect(redirect('/admin/posts?page=2', false)).toBe(
            `/login?redirect=${encodeURIComponent('/admin/posts?page=2')}`,
        );
        expect(redirect('/verify-email', false)).toContain('/login?');
    });

    it('lets anonymous visitors reach public and login routes, and signed-in users everywhere', () => {
        expect(redirect('/', false)).toBeNull();
        expect(redirect('/login', false)).toBeNull();
        expect(redirect('/admin', true)).toBeNull();
    });
});

describe('isScopedPath', () => {
    it('is true for the dashboard, admin and settings routes only', () => {
        for (const path of ['/admin', '/admin/posts', '/dashboard', '/dashboard/x', '/settings/profile']) {
            expect(isScopedPath(path), path).toBe(true);
        }
        for (const path of ['/', '/posts', '/confirm-password', '/administrators', '/api/admin/uploads/image']) {
            expect(isScopedPath(path), path).toBe(false);
        }
    });
});

describe('rejectsAnonymousAction', () => {
    const rejects = (method: string, path: string, signedIn = false) =>
        rejectsAnonymousAction(method, new URL(path, 'http://localhost'), signedIn);

    it('rejects signed-out RPC calls to every action but the public contact form', () => {
        expect(rejects('POST', '/_actions/posts.create')).toBe(true);
        expect(rejects('POST', '/_actions/account.deleteUser/')).toBe(true);
        expect(rejects('GET', '/_actions/users.list')).toBe(true);
        expect(rejects('POST', '/_actions/')).toBe(true);
        expect(rejects('POST', '/_actions')).toBe(true);
        expect(rejects('POST', '/_actions/contact.send')).toBe(false);
        expect(rejects('POST', '/_actions/contact.send/')).toBe(false);
        expect(rejects('POST', '/_actions/contact.sendAll')).toBe(true);
        expect(rejects('POST', '/_actions/contact.send/../posts.create')).toBe(true);
    });

    it('rejects signed-out form posts that name a private action, whatever the page', () => {
        expect(rejects('POST', '/contact?_action=posts.create')).toBe(true);
        expect(rejects('POST', '/login?_action=users.delete')).toBe(true);
        expect(rejects('POST', '/contact?_action=contact.send')).toBe(false);
        expect(rejects('POST', '/contact')).toBe(false);
        // Only POST-like requests run form actions.
        expect(rejects('GET', '/contact?_action=posts.create')).toBe(false);
    });

    it('never rejects a signed-in user', () => {
        expect(rejects('POST', '/_actions/posts.create', true)).toBe(false);
        expect(rejects('POST', '/contact?_action=posts.create', true)).toBe(false);
    });
});

describe('anonymousActionResponse', () => {
    it('is a 401 in the shape Astro actions use for errors', async () => {
        const response = anonymousActionResponse();
        expect(response.status).toBe(401);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        expect(await response.json()).toEqual({
            type: 'AstroActionError',
            code: 'UNAUTHORIZED',
            status: 401,
            message: 'Sign in required.',
        });
    });
});

describe('rejectsLargeAnonymousBody', () => {
    it.each([
        // [method, signedIn, content-length, rejected]
        ['POST', false, '0', false],
        ['POST', false, '512', false],
        ['POST', false, '65536', false],
        ['POST', false, '65537', true],
        ['POST', false, '104857600', true],
        ['POST', false, null, true],
        ['POST', false, '', true],
        ['POST', false, '-1', true],
        ['POST', false, '12abc', true],
        ['PUT', false, null, true],
        ['PATCH', false, '70000', true],
        ['DELETE', false, null, true],
        ['GET', false, null, false],
        ['HEAD', false, null, false],
        ['POST', true, null, false],
        ['POST', true, '104857600', false],
    ] as const)('%s signedIn=%s content-length=%j -> %s', (method, signedIn, contentLength, rejected) => {
        expect(rejectsLargeAnonymousBody(method, signedIn, contentLength)).toBe(rejected);
    });

    it('is answered with a 413', () => {
        expect(payloadTooLargeResponse().status).toBe(413);
    });
});

describe('isPublicPage', () => {
    it('accepts the public pages a visitor navigates to', () => {
        for (const path of ['/', '/posts', '/posts/enrollment-open', '/departments/cit', '/downloads', '/contact']) {
            expect(isPublicPage(path), path).toBe(true);
        }
    });

    it('rejects private routes, assets, API and feeds, whose responses a hover prefetch could not reuse', () => {
        for (const path of [
            '/login',
            '/forgot-password',
            '/admin/posts',
            '/dashboard',
            '/settings/profile',
            '/api/auth/session',
            '/_actions/contact.send',
            '/storage/posts/a.webp',
            '/_astro/app.js',
            '/rss.xml',
            '/sitemap.xml',
        ]) {
            expect(isPublicPage(path), path).toBe(false);
        }
    });
});
