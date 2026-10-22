import type { APIRoute } from 'astro';
import path from 'node:path';
import { directBaseUrl, publicUrl, read } from '@/lib/server/storage';

export const prerender = false;

const TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
};

/**
 * Serves uploaded files (and legacy Laravel /storage/* URLs) from the configured driver.
 * With S3_PUBLIC_URL set, inline requests redirect to the object URL;
 * `?download=` is always streamed here so the attachment filename is honoured.
 */
export const GET: APIRoute = async ({ params, url, redirect }) => {
    const key = params.path ?? '';
    const name = url.searchParams.get('download');

    if (directBaseUrl && name === null) {
        const target = publicUrl(key);
        if (target) return redirect(target, 301);
    }

    const file = await read(key);
    if (!file) return new Response('Not found', { status: 404 });
    const ext = path.extname(key).toLowerCase();
    const headers = new Headers({
        'Content-Type': TYPES[ext] ?? file.contentType ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
    });
    if (file.size) headers.set('Content-Length', String(file.size));
    if (file.mtime) headers.set('Last-Modified', file.mtime.toUTCString());
    if (name !== null)
        headers.set(
            'Content-Disposition',
            `attachment; filename="${(name || path.basename(key)).replace(/["\r\n]/g, '')}"`,
        );
    if (ext === '.svg') headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return new Response(file.body, { headers });
};
