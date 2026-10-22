import type { APIRoute } from 'astro';
import { absoluteUrl, escapeXml } from '@/lib/seo';
import { listPosts } from '@/lib/server/queries';
import { SITE } from '@/lib/site';

export const GET: APIRoute = async ({ site, url }) => {
    const origin = site ?? new URL(url.origin);
    const posts = (await listPosts({ sort: 'newest' }, { perPage: 20 })).items;
    const feedUrl = absoluteUrl('/rss.xml', origin);

    const items = posts
        .map((post) => {
            const link = escapeXml(absoluteUrl(`/posts/${post.slug}`, origin));
            return [
                '    <item>',
                `      <title>${escapeXml(post.title)}</title>`,
                `      <link>${link}</link>`,
                `      <guid isPermaLink="true">${link}</guid>`,
                `      <pubDate>${post.createdAt.toUTCString()}</pubDate>`,
                `      <category>${escapeXml(post.type)}</category>`,
                `      <description>${escapeXml(post.excerpt)}</description>`,
                '    </item>',
            ]
                .filter(Boolean)
                .join('\n');
        })
        .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${SITE.name} — News, Events & Announcements`)}</title>
    <link>${escapeXml(absoluteUrl('/posts', origin))}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>en-ph</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

    return new Response(xml, {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
    });
};
