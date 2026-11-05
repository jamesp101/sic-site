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
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
    };
    return new Response(JSON.stringify(manifest), {
        headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
        },
    });
};
