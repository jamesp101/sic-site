/**
 * HTTP edge helpers for the Node server: conditional requests (ETag / If-None-Match / If-Modified-Since)
 * and gzip/brotli for text responses. Free of `astro:*` imports. Vercel does both itself; the middleware
 * only calls `finishResponse` on Node.
 */
import { createHash } from 'node:crypto';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Bodies smaller than this are sent as is: the gain does not pay for the CPU and the header. */
export const MIN_COMPRESS_BYTES = 1024;

const COMPRESSIBLE =
    /^(text\/(html|css|plain|xml|javascript)|application\/(json|xml|javascript|[\w.+-]+\+(json|xml)))\b/i;

/** `W/"…"` match of one ETag against an `If-None-Match` value (weak comparison; `*` matches anything). */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
    if (!ifNoneMatch) return false;
    const strip = (tag: string) => tag.trim().replace(/^W\//, '');
    const wanted = strip(etag);
    return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || strip(tag) === wanted);
}

/** Weak validator for a stored object: changes whenever its size or modification time does. Null without an mtime. */
export function objectEtag(size: number, mtime: Date | null): string | null {
    return mtime ? `W/"${size.toString(16)}-${mtime.getTime().toString(16)}"` : null;
}

/**
 * True when the request's validators say the client's copy is current (answer 304). `If-None-Match`
 * wins over `If-Modified-Since`, which compares whole seconds as HTTP dates do.
 */
export function isNotModified(headers: Headers, etag: string | null, mtime: Date | null): boolean {
    const ifNoneMatch = headers.get('if-none-match');
    if (ifNoneMatch !== null) return etag !== null && etagMatches(ifNoneMatch, etag);
    const since = Date.parse(headers.get('if-modified-since') ?? '');
    return mtime !== null && Number.isFinite(since) && Math.floor(mtime.getTime() / 1000) * 1000 <= since;
}

/** The best encoding the client accepts (`br` before `gzip`), honouring `q=0`. */
export function pickEncoding(acceptEncoding: string | null): 'br' | 'gzip' | null {
    if (!acceptEncoding) return null;
    const accepted = new Map<string, number>();
    for (const part of acceptEncoding.split(',')) {
        const [name, ...params] = part.trim().toLowerCase().split(';');
        const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
        accepted.set(name, q === undefined ? 1 : Number(q));
    }
    const ok = (name: string) => (accepted.get(name) ?? accepted.get('*') ?? 0) > 0;
    if (ok('br')) return 'br';
    return ok('gzip') ? 'gzip' : null;
}

const withoutBody = (headers: Headers) => {
    const kept = new Headers(headers);
    kept.delete('content-length');
    kept.delete('content-encoding');
    return kept;
};

function appendVary(headers: Headers, value: string): void {
    const current = headers.get('vary');
    if (!current) headers.set('vary', value);
    else if (!current.split(',').some((v) => v.trim().toLowerCase() === value.toLowerCase())) {
        headers.set('vary', `${current}, ${value}`);
    }
}

export interface FinishOptions {
    request: Request;
    pathname: string;
}

/**
 * Last step of a Node response (after the request policy headers):
 * - a public, cacheable HTML page (GET, 200) gets a weak ETag over its body and `If-None-Match` is answered
 *   with 304;
 * - a text response (HTML, XML, JSON, JS, CSS, plain text) of at least `MIN_COMPRESS_BYTES` that is not
 *   already encoded is compressed with brotli or gzip, as the client accepts, and gets `Vary: Accept-Encoding`.
 * `/storage` and every other type pass through untouched, streams included.
 */
export async function finishResponse(response: Response, { request, pathname }: FinishOptions): Promise<Response> {
    if (request.method !== 'GET' || response.status !== 200 || !response.body) return response;
    if (pathname.startsWith('/storage/') || response.headers.has('content-encoding')) return response;
    const type = response.headers.get('content-type') ?? '';
    if (!COMPRESSIBLE.test(type)) return response;

    const body = new Uint8Array(await response.arrayBuffer());
    const headers = withoutBody(response.headers);
    const isPublicHtml = /^text\/html\b/i.test(type) && /(^|,\s*)public\b/i.test(headers.get('cache-control') ?? '');

    if (isPublicHtml) {
        const digest = createHash('sha1').update(body).digest('base64url').slice(0, 22);
        const etag = `W/"${body.byteLength.toString(16)}-${digest}"`;
        headers.set('etag', etag);
        if (etagMatches(request.headers.get('if-none-match'), etag)) {
            return new Response(null, { status: 304, headers });
        }
    }

    const encoding =
        body.byteLength >= MIN_COMPRESS_BYTES ? pickEncoding(request.headers.get('accept-encoding')) : null;
    if (body.byteLength >= MIN_COMPRESS_BYTES) appendVary(headers, 'Accept-Encoding');
    if (!encoding) {
        headers.set('content-length', String(body.byteLength));
        return new Response(body, { status: 200, headers });
    }
    const compressed =
        encoding === 'br'
            ? await brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
            : await gzipAsync(body);
    headers.set('content-encoding', encoding);
    headers.set('content-length', String(compressed.byteLength));
    return new Response(new Uint8Array(compressed), { status: 200, headers });
}
