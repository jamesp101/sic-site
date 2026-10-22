import sharp from 'sharp';
import { IMAGE_TARGETS, webpName, type ImageTargetName } from '../image-compress';

/** Decoding guard: refuses images with more pixels than a 64-megapixel photo (decompression bombs). */
const MAX_INPUT_PIXELS = 8000 * 8000;

/**
 * Stores every uploaded raster image as WebP inside the `target` box: EXIF orientation applied, never
 * upscaled, animated GIF/WebP kept animated. A WebP that already fits the box (the browser compressed
 * it with `compressImage`) is kept byte-for-byte so it is not lossy-encoded twice.
 * Throws when the bytes are not a decodable image.
 */
export async function toWebp(file: File, targetName: ImageTargetName): Promise<File> {
    const target = IMAGE_TARGETS[targetName];
    const image = sharp(new Uint8Array(await file.arrayBuffer()), {
        animated: true,
        limitInputPixels: MAX_INPUT_PIXELS,
    });
    const { format, width, height, pageHeight } = await image.metadata();
    // Animated images stack their frames vertically; `pageHeight` is one frame.
    const frameHeight = pageHeight ?? height;
    if (format === 'webp' && width <= target.maxWidth && frameHeight <= target.maxHeight) {
        return new File([await file.arrayBuffer()], webpName(file.name), { type: 'image/webp' });
    }
    const bytes = await image
        .rotate()
        .resize({ width: target.maxWidth, height: target.maxHeight, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: Math.round(target.quality * 100) })
        .toBuffer();
    return new File([new Uint8Array(bytes)], webpName(file.name), { type: 'image/webp' });
}
