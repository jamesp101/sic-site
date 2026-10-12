import type { APIRoute } from 'astro';

const DISALLOW = [
    '/admin',
    '/dashboard',
    '/settings',
    '/styleguide',
    '/api/',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/confirm-password',
    '/verify-email',
];

export const GET: APIRoute = ({ site, url }) => {
    const origin = site ?? new URL(url.origin);
    const body = [
        'User-agent: *',
        'Allow: /',
        ...DISALLOW.map((path) => `Disallow: ${path}`),
        '',
        `Sitemap: ${new URL('/sitemap.xml', origin).href}`,
        '',
    ].join('\n');
    return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
};
