import sharp, { type Metadata } from 'sharp';
import { IMAGE_TARGETS, webpName, type ImageTargetName } from '../image-compress';

/** Decoding guard: refuses images with more pixels than a 64-megapixel photo (decompression bombs). */
const MAX_INPUT_PIXELS = 8000 * 8000;

/** Formats an upload may really be, as sharp names them (AVIF is reported as `heif` with AV1 compression). */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);

/** Thrown for bytes that decode, but not as one of the allowed raster formats (SVG, TIFF, HEIC… under a `.png` name). */
export class UnsupportedImageError extends Error {
    constructor(format: string | undefined) {
        super(`Unsupported image format: ${format ?? 'unknown'}`);
    }
}

/** The real format of the decoded bytes, whatever the file name or declared type say. */
function realFormat({ format, compression }: Metadata): string | undefined {
    return format === 'heif' && compression === 'av1' ? 'avif' : format;
}

/**
 * Stores every uploaded raster image as WebP inside the `target` box: EXIF orientation applied, never
 * upscaled, animated GIF/WebP kept animated, all metadata (EXIF, XMP, GPS) dropped. A WebP that already
 * fits the box and carries no EXIF/XMP (the browser compressed it with `compressImage`) is kept
 * byte-for-byte so it is not lossy-encoded twice.
 * Throws when the bytes are not a decodable JPEG, PNG, WebP, GIF or AVIF image (`UnsupportedImageError` for other formats).
 */
export async function toWebp(file: File, targetName: ImageTargetName): Promise<File> {
    const target = IMAGE_TARGETS[targetName];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = sharp(bytes, { animated: true, limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();
    const format = realFormat(meta);
    if (!format || !ALLOWED_FORMATS.has(format)) throw new UnsupportedImageError(format);
    // Animated images stack their frames vertically; `pageHeight` is one frame.
    const frameHeight = meta.pageHeight ?? meta.height;
    const fits = meta.width <= target.maxWidth && frameHeight <= target.maxHeight;
    if (format === 'webp' && fits && !meta.exif && !meta.xmp) {
        return new File([bytes], webpName(file.name), { type: 'image/webp' });
    }
    // sharp drops all metadata on output unless asked to keep it.
    const out = await image
        .rotate()
        .resize({ width: target.maxWidth, height: target.maxHeight, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: Math.round(target.quality * 100) })
        .toBuffer();
    return new File([new Uint8Array(out)], webpName(file.name), { type: 'image/webp' });
}
