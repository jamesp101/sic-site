import type { APIRoute } from 'astro';
import { SITE } from '@/lib/site';

export const GET: APIRoute = () => {
    const manifest = {
        name: SITE.name,
        short_name: SITE.shortName,
        description: SITE.description,
        lang: SITE.lang,
        start_url: '/',
        scope: '/',
        display: 'browser',
        background_color: '#f2f7fe',
        theme_color: '#0a2e6e',
        icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
            { src: '/apple-touch-icon.png', sizes: '166x166', type: 'image/png' },
            { src: '/sic-seal.png', sizes: '224x224', type: 'image/png', purpose: 'any' },
        ],
    };
    return new Response(JSON.stringify(manifest), {
        headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
        },
    });
};
