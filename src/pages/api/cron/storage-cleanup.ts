import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { json } from '../../../lib/server/api-route';
import { runStorageCleanup } from '../../../lib/server/storage-cleanup-run';

export const prerender = false;

function authorised(header: string | null, secret: string): boolean {
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(header ?? '');
    // Equal length is required by timingSafeEqual; the length of the secret is not sensitive.
    return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily storage cleanup for Vercel Cron (`vercel.json` `crons`). Outside the admin session: the only
 * credential is `Authorization: Bearer ${CRON_SECRET}` (Vercel sends it automatically). Unset secret → 503.
 * `/api/*` is already `noindex` in middleware; the response is never cached.
 */
export const GET: APIRoute = async ({ request }) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return json({ message: 'Storage cleanup is not configured.' }, 503);
    if (!authorised(request.headers.get('authorization'), secret)) return json({ message: 'Unauthorized.' }, 401);

    const { keys: _keys, ...summary } = await runStorageCleanup();
    return new Response(JSON.stringify(summary), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow',
        },
    });
};
