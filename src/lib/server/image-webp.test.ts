import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vite-plus/test';
import { IMAGE_TARGETS } from '../image-compress';
import { toWebp } from './image-webp';

async function fileOf(image: Sharp, name: string, type: string): Promise<File> {
    return new File([new Uint8Array(await image.toBuffer())], name, { type });
}

const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } });

async function metaOf(file: File) {
    return sharp(new Uint8Array(await file.arrayBuffer()), { animated: true }).metadata();
}

describe('toWebp', () => {
    it('re-encodes JPEG/PNG as WebP inside the target box without upscaling', async () => {
        const big = await toWebp(await fileOf(solid(4000, 3000).jpeg(), 'Photo.JPG', 'image/jpeg'), 'highlight');
        expect(big.type).toBe('image/webp');
        expect(big.name).toBe('Photo.webp');
        const meta = await metaOf(big);
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([IMAGE_TARGETS.highlight.maxWidth, 1200]);

        const small = await metaOf(await toWebp(await fileOf(solid(120, 80).png(), 'logo.png', 'image/png'), 'logo'));
        expect([small.format, small.width, small.height, small.hasAlpha]).toEqual(['webp', 120, 80, true]);
    });

    it('applies EXIF orientation before resizing', async () => {
        // 600x300 stored, orientation 6 = displayed rotated 90°, i.e. 300x600.
        const rotated = await fileOf(
            solid(600, 300).jpeg().withMetadata({ orientation: 6 }),
            'phone.jpg',
            'image/jpeg',
        );
        const meta = await metaOf(await toWebp(rotated, 'portrait'));
        expect([meta.width, meta.height]).toEqual([240, 480]);
    });

    it('keeps animated GIFs animated and resizes every frame', async () => {
        const frame = (colour: string) => solid(800, 800).flatten({ background: colour }).png().toBuffer();
        const frames = await Promise.all(['#f00', '#0f0', '#00f'].map(frame));
        const gif = await fileOf(sharp(frames, { join: { animated: true } }).gif(), 'spin.gif', 'image/gif');
        const meta = await metaOf(await toWebp(gif, 'portrait'));
        expect([meta.format, meta.pages, meta.width, meta.pageHeight]).toEqual(['webp', 3, 480, 480]);
    });

    it('keeps a WebP that already fits byte-for-byte (no second lossy encode)', async () => {
        const webp = await fileOf(solid(300, 200).webp({ quality: 50 }), 'already.webp', 'image/webp');
        const out = await toWebp(webp, 'content');
        expect(new Uint8Array(await out.arrayBuffer())).toEqual(new Uint8Array(await webp.arrayBuffer()));
    });

    it('throws on bytes that are not an image', async () => {
        await expect(toWebp(new File(['<html>'], 'x.png', { type: 'image/png' }), 'content')).rejects.toThrow();
    });
});
