import { describe, expect, it } from 'vite-plus/test';
import { guardRequest, responseHeaders } from './request-policy';

const CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const BASE = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=600';
const NOINDEX = 'noindex, nofollow';

const headersFor = (path: string, opts: { method?: string; signedIn?: boolean; cc?: boolean; csp?: boolean } = {}) =>
    responseHeaders({
        method: opts.method ?? 'GET',
        url: new URL(path, 'http://localhost'),
        signedIn: opts.signedIn ?? false,
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

    it('adds HSTS only over https', () => {
        const https = responseHeaders({
            method: 'GET',
            url: new URL('https://example.org/'),
            signedIn: false,
            hasCacheControl: false,
            hasContentSecurityPolicy: false,
        });
        expect(https['Strict-Transport-Security']).toBe('max-age=31536000');
        expect(headersFor('/')['Strict-Transport-Security']).toBeUndefined();
    });
});

describe('guardRequest', () => {
    const guard = (path: string, signedIn: boolean) => guardRequest(new URL(path, 'http://localhost'), signedIn);

    it('redirects anonymous visitors of protected routes to login, keeping the target', () => {
        expect(guard('/admin/posts?page=2', false)).toEqual({
            redirect: `/login?redirect=${encodeURIComponent('/admin/posts?page=2')}`,
        });
        expect(guard('/verify-email', false)).toMatchObject({ redirect: expect.stringContaining('/login?') });
    });

    it('lets anonymous visitors reach public and login routes', () => {
        expect(guard('/', false)).toEqual({ redirect: null, scoped: false });
        expect(guard('/login', false)).toEqual({ redirect: null, scoped: false });
    });

    it('flags Admin-scoped routes only for signed-in users', () => {
        expect(guard('/admin', true)).toEqual({ redirect: null, scoped: true });
        expect(guard('/dashboard/x', true)).toEqual({ redirect: null, scoped: true });
        expect(guard('/confirm-password', true)).toEqual({ redirect: null, scoped: false });
        expect(guard('/posts', true)).toEqual({ redirect: null, scoped: false });
    });
});
