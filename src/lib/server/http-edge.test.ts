import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vite-plus/test';
import { etagMatches, finishResponse, isNotModified, MIN_COMPRESS_BYTES, objectEtag, pickEncoding } from './http-edge';

const HTML = `<!doctype html><html><body>${'<p>San Isidro College</p>'.repeat(200)}</body></html>`;
const PUBLIC = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600';

const page = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { headers: { 'Content-Type': 'text/html', 'Cache-Control': PUBLIC, ...headers } });
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => ({
    request: new Request(`http://localhost${path}`, { method, headers }),
    pathname: path,
});

describe('etagMatches', () => {
    it('compares weakly, over a list, and honours *', () => {
        expect(etagMatches('W/"a1"', 'W/"a1"')).toBe(true);
        expect(etagMatches('"a1"', 'W/"a1"')).toBe(true);
        expect(etagMatches('W/"zz", W/"a1"', 'W/"a1"')).toBe(true);
        expect(etagMatches('*', 'W/"a1"')).toBe(true);
        expect(etagMatches('W/"a2"', 'W/"a1"')).toBe(false);
        expect(etagMatches(null, 'W/"a1"')).toBe(false);
    });
});

describe('isNotModified', () => {
    const mtime = new Date('2026-01-02T03:04:05.678Z');
    const etag = objectEtag(10, mtime);

    it('builds the ETag from size and mtime, and none without an mtime', () => {
        expect(etag).toMatch(/^W\/"a-[0-9a-f]+"$/);
        expect(objectEtag(10, new Date(mtime.getTime() + 1))).not.toBe(etag);
        expect(objectEtag(10, null)).toBeNull();
    });

    it('answers 304 for a matching If-None-Match, and only then when one is sent', () => {
        expect(isNotModified(new Headers({ 'if-none-match': etag! }), etag, mtime)).toBe(true);
        expect(isNotModified(new Headers({ 'if-none-match': 'W/"other"' }), etag, mtime)).toBe(false);
        // If-None-Match wins over a fresh If-Modified-Since.
        expect(
            isNotModified(
                new Headers({ 'if-none-match': 'W/"other"', 'if-modified-since': mtime.toUTCString() }),
                etag,
                mtime,
            ),
        ).toBe(false);
    });

    it('answers 304 when If-Modified-Since is not older than the file (whole seconds)', () => {
        expect(isNotModified(new Headers({ 'if-modified-since': mtime.toUTCString() }), etag, mtime)).toBe(true);
        const older = new Date(mtime.getTime() - 5000).toUTCString();
        expect(isNotModified(new Headers({ 'if-modified-since': older }), etag, mtime)).toBe(false);
        expect(isNotModified(new Headers({ 'if-modified-since': 'garbage' }), etag, mtime)).toBe(false);
        expect(isNotModified(new Headers(), etag, mtime)).toBe(false);
        expect(isNotModified(new Headers({ 'if-modified-since': mtime.toUTCString() }), null, null)).toBe(false);
    });
});

describe('pickEncoding', () => {
    it.each([
        [null, null],
        ['', null],
        ['identity', null],
        ['gzip', 'gzip'],
        ['gzip, deflate, br', 'br'],
        ['br;q=0, gzip', 'gzip'],
        ['gzip;q=0', null],
        ['*', 'br'],
        ['*;q=0.5, br;q=0', 'gzip'],
    ])('%s → %s', (header, expected) => {
        expect(pickEncoding(header)).toBe(expected);
    });
});

describe('finishResponse', () => {
    it('adds a weak ETag to a public page and answers a matching If-None-Match with 304', async () => {
        const first = await finishResponse(page(HTML), get('/posts'));
        const etag = first.headers.get('etag');
        expect(etag).toMatch(/^W\/"/);
        expect(await first.text()).toBe(HTML);

        const again = await finishResponse(page(HTML), get('/posts', { 'if-none-match': etag! }));
        expect(again.status).toBe(304);
        expect(again.headers.get('etag')).toBe(etag);
        expect(again.headers.get('cache-control')).toBe(PUBLIC);
        expect(await again.text()).toBe('');

        const changed = await finishResponse(page(HTML + '!'), get('/posts', { 'if-none-match': etag! }));
        expect(changed.status).toBe(200);
        expect(changed.headers.get('etag')).not.toBe(etag);
    });

    it('does not tag private pages', async () => {
        const out = await finishResponse(page(HTML, { 'Cache-Control': 'no-store' }), get('/admin'));
        expect(out.headers.get('etag')).toBeNull();
        expect(out.status).toBe(200);
    });

    it('compresses with brotli or gzip as accepted, keeps the content, and varies on Accept-Encoding', async () => {
        const br = await finishResponse(page(HTML), get('/', { 'accept-encoding': 'gzip, br' }));
        expect(br.headers.get('content-encoding')).toBe('br');
        expect(br.headers.get('vary')).toBe('Accept-Encoding');
        const brBytes = new Uint8Array(await br.arrayBuffer());
        expect(Number(br.headers.get('content-length'))).toBe(brBytes.byteLength);
        expect(brBytes.byteLength).toBeLessThan(HTML.length);
        expect(brotliDecompressSync(brBytes).toString()).toBe(HTML);

        const gz = await finishResponse(page(HTML), get('/', { 'accept-encoding': 'gzip' }));
        expect(gz.headers.get('content-encoding')).toBe('gzip');
        expect(gunzipSync(new Uint8Array(await gz.arrayBuffer())).toString()).toBe(HTML);

        const none = await finishResponse(page(HTML), get('/', { 'accept-encoding': 'identity' }));
        expect(none.headers.get('content-encoding')).toBeNull();
        expect(none.headers.get('vary')).toBe('Accept-Encoding');
        expect(await none.text()).toBe(HTML);
    });

    it('compresses JSON, XML, CSS and JS but not images', async () => {
        const text = 'x'.repeat(MIN_COMPRESS_BYTES * 2);
        for (const type of [
            'application/json',
            'application/xml',
            'text/css',
            'text/javascript',
            'application/rss+xml',
        ]) {
            const out = await finishResponse(
                new Response(text, { headers: { 'Content-Type': `${type}; charset=utf-8` } }),
                get('/x', { 'accept-encoding': 'gzip' }),
            );
            expect(out.headers.get('content-encoding'), type).toBe('gzip');
        }
        const image = new Response(text, { headers: { 'Content-Type': 'image/webp' } });
        expect(await finishResponse(image, get('/x', { 'accept-encoding': 'gzip' }))).toBe(image);
    });

    it('streams a non-cacheable body through the compressor: it arrives compressed, complete and without a length', async () => {
        const chunks = Array.from({ length: 50 }, (_, i) => `<p>chunk ${i} of the San Isidro College page</p>\n`);
        const expected = chunks.join('');
        const encoder = new TextEncoder();
        const stream = () => {
            let next = 0;
            return new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (next < chunks.length) controller.enqueue(encoder.encode(chunks[next++]));
                    else controller.close();
                },
            });
        };
        const priv = () =>
            new Response(stream(), { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });

        const br = await finishResponse(priv(), get('/admin', { 'accept-encoding': 'br' }));
        expect(br.headers.get('content-encoding')).toBe('br');
        expect(br.headers.get('content-length')).toBeNull();
        expect(br.headers.get('vary')).toBe('Accept-Encoding');
        expect(br.headers.get('etag')).toBeNull();
        const brBytes = new Uint8Array(await br.arrayBuffer());
        expect(brBytes.byteLength).toBeLessThan(expected.length);
        expect(brotliDecompressSync(brBytes).toString()).toBe(expected);

        const gz = await finishResponse(priv(), get('/admin', { 'accept-encoding': 'gzip' }));
        expect(gunzipSync(new Uint8Array(await gz.arrayBuffer())).toString()).toBe(expected);

        const plain = await finishResponse(priv(), get('/admin'));
        expect(plain.headers.get('content-encoding')).toBeNull();
        expect(await plain.text()).toBe(expected);

        const tiny = await finishResponse(
            new Response(new Blob(['<p>hi</p>']).stream(), {
                headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
            }),
            get('/admin', { 'accept-encoding': 'gzip' }),
        );
        expect(tiny.headers.get('content-encoding')).toBeNull();
        expect(tiny.headers.get('vary')).toBeNull();
        expect(await tiny.text()).toBe('<p>hi</p>');
    });

    it('leaves small bodies, /storage, encoded responses, non-200 and non-GET alone', async () => {
        const accept = { 'accept-encoding': 'gzip' };
        const small = await finishResponse(page('<p>hi</p>'), get('/', accept));
        expect(small.headers.get('content-encoding')).toBeNull();
        expect(small.headers.get('vary')).toBeNull();
        expect(await small.text()).toBe('<p>hi</p>');

        const stored = page(HTML);
        expect(await finishResponse(stored, get('/storage/notes.txt', accept))).toBe(stored);

        const encoded = page(HTML, { 'Content-Encoding': 'br' });
        expect(await finishResponse(encoded, get('/', accept))).toBe(encoded);

        const missing = new Response(HTML, { status: 404, headers: { 'Content-Type': 'text/html' } });
        expect(await finishResponse(missing, get('/', accept))).toBe(missing);

        const post = page(HTML);
        expect(await finishResponse(post, get('/', accept, 'POST'))).toBe(post);
    });
});
