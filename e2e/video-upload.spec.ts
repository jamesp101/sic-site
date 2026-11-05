import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';
import { PORT, UPLOADS } from './env';

test.use({ storageState: ADMIN });

const SIZE = 4096;

/**
 * A small MP4: a valid `ftyp` box (isom brand) followed by an `mdat` box of counting bytes. It is not
 * playable, but the server stores and serves bytes, and it only decides the type by extension.
 */
function tinyMp4(): Buffer {
    const bytes = Buffer.alloc(SIZE);
    bytes.writeUInt32BE(24, 0);
    bytes.write('ftypisom', 4, 'latin1');
    bytes.writeUInt32BE(0x200, 12);
    bytes.write('isomiso2', 16, 'latin1');
    bytes.writeUInt32BE(SIZE - 24, 24);
    bytes.write('mdat', 28, 'latin1');
    for (let index = 32; index < SIZE; index++) bytes[index] = index % 251;
    return bytes;
}

interface Grant {
    key: string;
    url: string;
    contentType: string;
}

async function issue(request: APIRequestContext, data: object) {
    return request.post('/api/admin/uploads/video', { data });
}

async function issueMp4(request: APIRequestContext, size = SIZE) {
    const response = await issue(request, { fileName: 'clip.mp4', contentType: 'video/mp4', size });
    expect(response.ok(), await response.text()).toBe(true);
    const grant: Grant = await response.json();
    return grant;
}

const stored = (key: string) => path.resolve(UPLOADS, key);

test('uploads an mp4 in two steps and serves it with working byte ranges', async ({ request }) => {
    const bytes = tinyMp4();
    const grant = await issueMp4(request);
    expect(grant.key).toMatch(/^videos\/[0-9a-f]{32}\.mp4$/);
    expect(grant.contentType).toBe('video/mp4');
    expect(grant.url).toContain('/api/admin/uploads/video?');
    expect(fs.existsSync(stored(grant.key)), 'nothing is stored before the bytes arrive').toBe(false);

    const put = await request.put(grant.url, { headers: { 'Content-Type': grant.contentType }, data: bytes });
    expect(put.status(), await put.text()).toBe(204);
    expect(fs.statSync(stored(grant.key)).size).toBe(SIZE);

    const done = await request.post('/api/admin/uploads/video/complete', { data: { key: grant.key } });
    expect(done.ok(), await done.text()).toBe(true);
    const { url }: { url: string } = await done.json();
    expect(url).toBe(`/storage/${grant.key}`);

    // The claim is consumed: the upload cannot be completed twice.
    const again = await request.post('/api/admin/uploads/video/complete', { data: { key: grant.key } });
    expect(again.status()).toBe(400);

    const whole = await request.get(url);
    expect(whole.status()).toBe(200);
    expect(whole.headers()['content-type']).toBe('video/mp4');
    expect(whole.headers()['accept-ranges']).toBe('bytes');
    expect(whole.headers()['content-length']).toBe(String(SIZE));
    // Inline, not an attachment, so a <video> element can play it.
    expect(whole.headers()['content-disposition']).toBeUndefined();
    expect(whole.headers()['x-content-type-options']).toBe('nosniff');

    const head = await request.get(url, { headers: { Range: 'bytes=0-99' } });
    expect(head.status()).toBe(206);
    expect(head.headers()['content-range']).toBe(`bytes 0-99/${SIZE}`);
    expect(head.headers()['content-length']).toBe('100');
    const slice = await head.body();
    expect(slice.length).toBe(100);
    expect(slice.equals(bytes.subarray(0, 100))).toBe(true);

    const middle = await request.get(url, { headers: { Range: 'bytes=1000-' } });
    expect(middle.status()).toBe(206);
    expect(middle.headers()['content-range']).toBe(`bytes 1000-${SIZE - 1}/${SIZE}`);
    expect((await middle.body()).equals(bytes.subarray(1000))).toBe(true);

    const suffix = await request.get(url, { headers: { Range: 'bytes=-10' } });
    expect(suffix.status()).toBe(206);
    expect((await suffix.body()).equals(bytes.subarray(SIZE - 10))).toBe(true);

    const past = await request.get(url, { headers: { Range: `bytes=${SIZE}-` } });
    expect(past.status()).toBe(416);
    expect(past.headers()['content-range']).toBe(`bytes */${SIZE}`);

    fs.rmSync(stored(grant.key), { force: true });
});

test('rejects unsupported types and oversized announcements before issuing a key', async ({ request }) => {
    for (const data of [
        { fileName: 'notes.pdf', contentType: 'application/pdf', size: 10 },
        { fileName: 'page.html', contentType: 'text/html', size: 10 },
        { fileName: 'clip.mp4', contentType: 'application/pdf', size: 10 },
        { fileName: 'clip.mov', contentType: 'video/quicktime', size: 10 },
    ]) {
        const response = await issue(request, data);
        expect(response.status(), JSON.stringify(data)).toBe(422);
    }
    const tooLarge = await issue(request, {
        fileName: 'big.mp4',
        contentType: 'video/mp4',
        size: 100 * 1024 * 1024 + 1,
    });
    expect(tooLarge.status()).toBe(422);
    const { message }: { message: string } = await tooLarge.json();
    expect(message).toMatch(/100 MB/);
    expect((await issue(request, { fileName: 'a.mp4', contentType: 'video/mp4', size: 0 })).status()).toBe(400);
});

test('stops and removes a file that grows past its announced size', async ({ request }) => {
    const grant = await issueMp4(request, 1000);
    const put = await request.put(grant.url, { headers: { 'Content-Type': grant.contentType }, data: tinyMp4() });
    expect(put.status()).toBe(400);
    expect(fs.existsSync(stored(grant.key))).toBe(false);
    const dir = path.dirname(stored(grant.key));
    const leftovers = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.startsWith(path.basename(grant.key)))
        : [];
    expect(leftovers).toEqual([]);
});

test('removes a file shorter than announced and refuses to complete it', async ({ request }) => {
    const grant = await issueMp4(request, SIZE + 10);
    const put = await request.put(grant.url, { headers: { 'Content-Type': grant.contentType }, data: tinyMp4() });
    expect(put.status()).toBe(400);
    expect(fs.existsSync(stored(grant.key))).toBe(false);
    const done = await request.post('/api/admin/uploads/video/complete', { data: { key: grant.key } });
    expect(done.status()).toBe(400);
});

test('another user can neither send bytes to nor complete a key issued to someone else', async ({
    playwright,
    request,
}) => {
    const grant = await issueMp4(request);
    const other = await playwright.request.newContext({ baseURL: `http://localhost:${PORT}`, storageState: CIT });
    try {
        const put = await other.put(grant.url, { headers: { 'Content-Type': grant.contentType }, data: tinyMp4() });
        expect(put.status()).toBe(400);
        expect(fs.existsSync(stored(grant.key))).toBe(false);

        // The owner uploads; the other user still cannot complete (or claim) it.
        expect(
            (
                await request.put(grant.url, { headers: { 'Content-Type': grant.contentType }, data: tinyMp4() })
            ).status(),
        ).toBe(204);
        const stolen = await other.post('/api/admin/uploads/video/complete', { data: { key: grant.key } });
        expect(stolen.status()).toBe(400);
        expect(fs.existsSync(stored(grant.key))).toBe(true);

        const done = await request.post('/api/admin/uploads/video/complete', { data: { key: grant.key } });
        expect(done.ok(), await done.text()).toBe(true);
    } finally {
        await other.dispose();
        fs.rmSync(stored(grant.key), { force: true });
    }
});

test('requires a signed-in user and a key the server issued', async ({ playwright, request }) => {
    // `test.use({ storageState })` also applies to contexts made here, so pass an empty state explicitly.
    const anonymous = await playwright.request.newContext({
        baseURL: `http://localhost:${PORT}`,
        storageState: { cookies: [], origins: [] },
    });
    try {
        const response = await anonymous.post('/api/admin/uploads/video', {
            data: { fileName: 'clip.mp4', contentType: 'video/mp4', size: 10 },
        });
        expect(response.status()).toBe(401);
    } finally {
        await anonymous.dispose();
    }
    const forged = `videos/${'0'.repeat(32)}.mp4`;
    const query = new URLSearchParams({ key: forged, size: '10' });
    expect((await request.put(`/api/admin/uploads/video?${query}`, { data: Buffer.alloc(10) })).status()).toBe(400);
    expect((await request.post('/api/admin/uploads/video/complete', { data: { key: forged } })).status()).toBe(400);
    expect(fs.existsSync(stored(forged))).toBe(false);
});
