import sharp from 'sharp';
import { describe, expect, it } from 'vite-plus/test';
import { imageFile, ImageUpload, storedImage } from './image-file';
import { RequestError } from './request-error';

const png = async (name = 'a.png') =>
    new File(
        [
            new Uint8Array(
                await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
                    .png()
                    .toBuffer(),
            ),
        ],
        name,
        { type: 'image/png' },
    );

describe('imageFile', () => {
    it('only checks type and size: undecodable bytes with an image type pass until they are stored', async () => {
        const fake = new File(['not really an image'], 'x.png', { type: 'image/png' });
        const parsed = await imageFile(1024, 'content').safeParseAsync(fake);
        expect(parsed.success).toBe(true);
        expect(parsed.data).toBeInstanceOf(ImageUpload);
        await expect(storedImage(parsed.data as File)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects a wrong declared type and an oversized file', async () => {
        const schema = imageFile(10, 'content');
        const wrongType = await schema.safeParseAsync(new File(['x'], 'a.svg', { type: 'image/svg+xml' }));
        expect(wrongType.success).toBe(false);
        const big = await schema.safeParseAsync(await png());
        expect(big.error?.issues[0]?.message).toMatch(/must not be larger/);
    });
});

describe('storedImage', () => {
    it('converts an ImageUpload to WebP inside its target', async () => {
        const upload = new ImageUpload(await png('Photo.PNG'), 'logo');
        const out = await storedImage(upload);
        expect([out.type, out.name]).toEqual(['image/webp', 'Photo.webp']);
    });

    it('passes any other file through untouched', async () => {
        const file = new File(['pdf'], 'a.pdf', { type: 'application/pdf' });
        expect(await storedImage(file)).toBe(file);
    });

    it('reports a disallowed real format as a RequestError', async () => {
        const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'], 'a.png', {
            type: 'image/png',
        });
        await expect(storedImage(new ImageUpload(svg, 'content'))).rejects.toBeInstanceOf(RequestError);
    });
});
