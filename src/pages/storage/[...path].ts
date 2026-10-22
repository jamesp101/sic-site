import type { APIRoute } from 'astro';
import path from 'node:path';
import { FILE_TYPES } from '@/lib/server/file-types';
import { directBaseUrl, publicUrl, read } from '@/lib/server/storage';

export const prerender = false;

/** Types a browser may display inline (scripts stay blocked by the CSP below); everything else is an attachment. */
const INLINE = /^(image\/(jpeg|png|webp|gif|avif|svg\+xml)|application\/pdf|text\/(plain|csv))$/;

/**
 * Serves uploaded files (and legacy Laravel /storage/* URLs) from the configured driver.
 * With S3_PUBLIC_URL set, inline requests for allowlisted extensions redirect to the object URL;
 * `?download=` and every other key are streamed here so these headers apply.
 */
export const GET: APIRoute = async ({ params, url, redirect }) => {
    const key = params.path ?? '';
    const name = url.searchParams.get('download');
    const ext = path.extname(key).toLowerCase();

    if (directBaseUrl && name === null && Object.hasOwn(FILE_TYPES, ext)) {
        const target = publicUrl(key);
        if (target) return redirect(target, 301);
    }

    const file = await read(key);
    if (!file) return new Response('Not found', { status: 404 });
    // The type follows the extension only (never the stored object's metadata), so an upload can
    // never be served as HTML. Legacy Laravel `.svg` files render as images under the CSP below.
    const type = ext === '.svg' ? 'image/svg+xml' : (FILE_TYPES[ext] ?? 'application/octet-stream');
    const headers = new Headers({
        'Content-Type': type.startsWith('text/') ? `${type}; charset=utf-8` : type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
    });
    // PDFs are exempt from the sandbox: Chrome refuses to render a PDF in a sandboxed document.
    if (type !== 'application/pdf') {
        headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    if (file.size) headers.set('Content-Length', String(file.size));
    if (file.mtime) headers.set('Last-Modified', file.mtime.toUTCString());
    if (name !== null || !INLINE.test(type)) {
        headers.set(
            'Content-Disposition',
            `attachment; filename="${(name || path.basename(key)).replace(/["\r\n]/g, '')}"`,
        );
    }
    return new Response(file.body, { headers });
};
