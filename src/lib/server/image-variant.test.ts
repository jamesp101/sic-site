import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { backfillVariants, variantOf } from './image-variant';
import { createLocalDriver } from './storage/local';

let dir: string;

beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sic-variants-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const image = (width: number) =>
    sharp({ create: { width, height: width / 2, channels: 3, background: '#336699' } })
        .webp()
        .toBuffer();

describe('variantOf', () => {
    it('scales down to 640 px wide and never up', async () => {
        const wide = await variantOf(new Uint8Array(await image(1600)), 640);
        expect((await sharp(new Uint8Array(await wide!.arrayBuffer())).metadata()).width).toBe(640);
        const small = await variantOf(new Uint8Array(await image(300)), 640);
        expect((await sharp(new Uint8Array(await small!.arrayBuffer())).metadata()).width).toBe(300);
    });
});

describe('backfillVariants', () => {
    it('creates missing variants of Highlight images only, and a second run changes nothing', async () => {
        mkdirSync(path.join(dir, 'posts/inline'), { recursive: true });
        writeFileSync(path.join(dir, 'posts/a.webp'), await image(1600));
        writeFileSync(path.join(dir, 'posts/b.webp'), await image(1200));
        writeFileSync(path.join(dir, 'posts/b.w640.webp'), await image(640));
        writeFileSync(path.join(dir, 'posts/inline/c.webp'), await image(1600));
        writeFileSync(path.join(dir, 'posts/broken.webp'), 'not an image');
        const driver = createLocalDriver(dir);

        const first = await backfillVariants(driver);
        expect(first.created).toBe(1);
        expect(first.existing).toBe(1);
        expect(first.skipped.map((s) => s.key)).toEqual(['posts/broken.webp']);
        expect(await driver.head('posts/a.w640.webp')).not.toBeNull();
        expect(await driver.head('posts/inline/c.w640.webp')).toBeNull();

        const second = await backfillVariants(driver);
        expect(second.created).toBe(0);
        expect(second.existing).toBe(2);
    });

    it('creates the 960 px variant of the given Slide photos only', async () => {
        mkdirSync(path.join(dir, 'carousels'), { recursive: true });
        writeFileSync(path.join(dir, 'carousels/s.webp'), await image(1920));
        writeFileSync(path.join(dir, 'carousels/layer.webp'), await image(800));
        const driver = createLocalDriver(dir);

        const report = await backfillVariants(driver, ['carousels/s.webp']);
        expect(report.created).toBe(1);
        const variant = await driver.get('carousels/s.w960.webp');
        expect((await sharp(new Uint8Array(await new Response(variant!.body).arrayBuffer())).metadata()).width).toBe(
            960,
        );
        expect(await driver.head('carousels/layer.w960.webp')).toBeNull();
    });
});
