import type { APIRoute } from 'astro';
import path from 'node:path';
import { FILE_TYPES } from '@/lib/server/file-types';
import { isNotModified, objectEtag } from '@/lib/server/http-edge';
import { RangeNotSatisfiableError } from '@/lib/server/storage/errors';
import { parseRangeHeader } from '@/lib/server/storage/range';
import { directBaseUrl, publicUrl, read, servedKey } from '@/lib/server/storage';

export const prerender = false;

/** Types a browser may display inline (scripts stay blocked by the CSP below); everything else is an attachment. */
const INLINE = /^(image\/(jpeg|png|webp|gif|avif|svg\+xml)|video\/(mp4|webm)|application\/pdf|text\/(plain|csv))$/;

/**
 * Serves uploaded files (and legacy Laravel /storage/* URLs) from the configured driver.
 * With S3_PUBLIC_URL set, inline requests for allowlisted extensions redirect to the object URL;
 * `?download=` and every other key are streamed here so these headers apply.
 * A single `Range: bytes=…` request gets a 206 slice (video seeking), an unsatisfiable one a 416.
 */
export const GET: APIRoute = async ({ params, url, request, redirect }) => {
    const requested = params.path ?? '';
    // A missing image variant is answered with its original (and a short cache time, so the variant is picked up once it exists).
    const key = await servedKey(requested);
    const fallback = key !== requested;
    const name = url.searchParams.get('download');
    const ext = path.extname(key).toLowerCase();

    if (directBaseUrl && name === null && Object.hasOwn(FILE_TYPES, ext)) {
        const target = publicUrl(key);
        if (target) {
            const response = redirect(target, fallback ? 302 : 301);
            // The variant redirect never changes (keys are unique); the fallback is short-lived so the variant is picked up once it exists.
            response.headers.set(
                'Cache-Control',
                fallback ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
            );
            return response;
        }
    }

    let file;
    try {
        file = await read(key, parseRangeHeader(request.headers.get('range')) ?? undefined);
    } catch (error) {
        if (!(error instanceof RangeNotSatisfiableError)) throw error;
        return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${error.size}`, 'Accept-Ranges': 'bytes' },
        });
    }
    if (!file) return new Response('Not found', { status: 404 });
    // The type follows the extension only (never the stored object's metadata), so an upload can
    // never be served as HTML. Legacy Laravel `.svg` files render as images under the CSP below.
    const type = ext === '.svg' ? 'image/svg+xml' : (FILE_TYPES[ext] ?? 'application/octet-stream');
    const headers = new Headers({
        'Content-Type': type.startsWith('text/') ? `${type}; charset=utf-8` : type,
        'Cache-Control': fallback ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
    });
    const etag = objectEtag(file.size, file.mtime);
    if (etag) headers.set('ETag', etag);
    if (file.mtime) headers.set('Last-Modified', file.mtime.toUTCString());
    // Conditional requests are answered before Range, and without sending the body.
    if (isNotModified(request.headers, etag, file.mtime)) {
        await file.body.cancel();
        return new Response(null, { status: 304, headers });
    }
    // PDFs are exempt from the sandbox: Chrome refuses to render a PDF in a sandboxed document.
    if (type !== 'application/pdf') {
        headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    const length = file.range ? file.range.end - file.range.start + 1 : file.size;
    if (length) headers.set('Content-Length', String(length));
    if (file.range) headers.set('Content-Range', `bytes ${file.range.start}-${file.range.end}/${file.size}`);
    if (name !== null || !INLINE.test(type)) {
        headers.set(
            'Content-Disposition',
            `attachment; filename="${(name || path.basename(key)).replace(/["\r\n]/g, '')}"`,
        );
    }
    return new Response(file.body, { status: file.range ? 206 : 200, headers });
};
