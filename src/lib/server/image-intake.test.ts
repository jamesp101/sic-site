import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import type * as ImageIntake from './image-intake';
import type * as Storage from './storage';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const dir = mkdtempSync(path.join(tmpdir(), 'sic-image-intake-'));
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = dir;

let intake: typeof ImageIntake;
let storage: typeof Storage;

// The storage driver reads UPLOAD_DIR when its module loads, so the modules load after the env is set.
beforeAll(async () => {
    storage = await import('./storage');
    intake = await import('./image-intake');
});
afterAll(async () => {
    await (await import('./test-db')).closeTestDb();
    rmSync(dir, { recursive: true, force: true });
});

/** Each case uses its own user so upload quotas never leak between cases. */
let nextUser = 1;
const newUser = () => nextUser++;

async function storedKeys(): Promise<string[]> {
    const keys: string[] = [];
    for await (const object of storage.driver.list()) keys.push(object.key);
    return keys;
}

async function png(width = 40, height = 30) {
    return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
        .png()
        .toBuffer();
}

const upload = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });

async function bytesOf(key: string): Promise<Buffer> {
    const object = await storage.read(key);
    expect(object).not.toBeNull();
    return Buffer.from(await new Response(object!.body).arrayBuffer());
}

describe('acceptImage', () => {
    it('stores a PNG content image as WebP under posts/inline and serves it at the returned URL', async () => {
        const { key, url } = await intake.acceptImage(
            newUser(),
            'content',
            upload(await png(), 'photo.png', 'image/png'),
        );

        expect(key).toMatch(/^posts\/inline\/.+\.webp$/);
        expect(url).toBe(`/storage/${key}`);
        const stored = await bytesOf(key);
        const meta = await sharp(stored).metadata();
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([40, 30]);
    });

    it('stores a PNG layer image as WebP under carousels', async () => {
        const { key, url } = await intake.acceptImage(
            newUser(),
            'layer',
            upload(await png(), 'layer.png', 'image/png'),
        );

        expect(key).toMatch(/^carousels\/.+\.webp$/);
        expect(url).toBe(`/storage/${key}`);
        expect((await sharp(await bytesOf(key)).metadata()).format).toBe('webp');
    });

    it('rejects an unknown kind and stores nothing', async () => {
        const before = await storedKeys();
        const file = upload(await png(), 'photo.png', 'image/png');

        await expect(intake.acceptImage(newUser(), 'avatar' as ImageIntake.ImageIntakeKind, file)).rejects.toThrow();
        expect(await storedKeys()).toEqual(before);
    });

    it('rejects an SVG declared as image/png and stores nothing', async () => {
        const before = await storedKeys();
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
        );

        await expect(
            intake.acceptImage(newUser(), 'content', upload(svg, 'logo.png', 'image/png')),
        ).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        expect(await storedKeys()).toEqual(before);
    });

    it('rejects a TIFF renamed .png and declared image/png and stores nothing', async () => {
        const before = await storedKeys();
        const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
            .tiff()
            .toBuffer();

        await expect(
            intake.acceptImage(newUser(), 'layer', upload(tiff, 'scan.png', 'image/png')),
        ).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        expect(await storedKeys()).toEqual(before);
    });

    it('rejects a file over the size limit and stores nothing', async () => {
        const before = await storedKeys();
        const tooBig = new Uint8Array(storage.LIMITS.image + 1);

        await expect(
            intake.acceptImage(newUser(), 'content', upload(tooBig, 'big.png', 'image/png')),
        ).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        expect(await storedKeys()).toEqual(before);
    });

    it('refuses the upload after the quota of 60 and stores nothing for it', async () => {
        const user = newUser();
        const file = upload(await png(8, 8), 'tiny.png', 'image/png');
        for (let i = 0; i < 60; i++) await intake.acceptImage(user, 'content', file);
        const before = await storedKeys();

        await expect(intake.acceptImage(user, 'content', file)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(await storedKeys()).toEqual(before);
        // Another user is unaffected.
        await expect(intake.acceptImage(newUser(), 'content', file)).resolves.toBeDefined();
    });
});

describe('isImageIntakeKind', () => {
    it('accepts content and layer only', () => {
        expect(['content', 'layer', 'avatar', 'toString', '', null, 3].map((v) => intake.isImageIntakeKind(v))).toEqual(
            [true, true, false, false, false, false, false],
        );
    });
});
