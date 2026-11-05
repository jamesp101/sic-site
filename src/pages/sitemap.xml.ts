import type { APIRoute } from 'astro';
import { absoluteUrl, escapeXml, siteUrl } from '@/lib/seo';
import { SITEMAP_PAGES, departmentHref } from '@/lib/site-nav';
import { getSitemapData } from '@/lib/server/queries';

export const GET: APIRoute = async (context) => {
    const origin = siteUrl(context);
    const { departments, posts } = await getSitemapData();
    const latestPost = posts.reduce<Date | null>(
        (latest, p) => (!latest || p.updatedAt > latest ? p.updatedAt : latest),
        null,
    );

    const entry = (path: string, lastmod?: Date | null, image?: { url: string; title: string } | null) =>
        [
            '  <url>',
            `    <loc>${escapeXml(absoluteUrl(path, origin))}</loc>`,
            lastmod ? `    <lastmod>${lastmod.toISOString()}</lastmod>` : '',
            image
                ? `    <image:image><image:loc>${escapeXml(absoluteUrl(image.url, origin))}</image:loc><image:title>${escapeXml(image.title)}</image:title></image:image>`
                : '',
            '  </url>',
        ]
            .filter(Boolean)
            .join('\n');

    const body = [
        ...SITEMAP_PAGES.map((path) => entry(path, path === '/' || path === '/posts' ? latestPost : null)),
        ...departments.map((d) => entry(departmentHref(d.slug), d.updatedAt)),
        ...posts.map((p) =>
            entry(`/posts/${p.slug}`, p.updatedAt, p.imageUrl ? { url: p.imageUrl, title: p.title } : null),
        ),
    ].join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`;

    return new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
};
