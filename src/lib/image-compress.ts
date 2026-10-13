/**
 * Client-side image compression for admin uploads: decode, downscale to a per-use box, re-encode as
 * WebP. Runs in the browser only (canvas); pure helpers (`fitWithin`, `webpName`, `IMAGE_TARGETS`)
 * are importable anywhere and unit-tested.
 *
 * Rules:
 * - Never upscale; keep aspect ratio.
 * - GIF (may be animated) and SVG pass through untouched.
 * - If the browser cannot encode WebP (canvas falls back to PNG), keep the original file.
 * - If re-encoding did not help (no resize and the result is not smaller), keep the original file.
 */

export interface ImageTarget {
    /** Longest allowed width/height in CSS pixels of the stored file. */
    maxWidth: number;
    maxHeight: number;
    /** WebP quality 0..1. */
    quality: number;
}

/** Output boxes per use: sized for the largest place the image is shown (incl. 2x screens). */
export const IMAGE_TARGETS = {
    /** Carousel slides: full-width 16:9 hero. */
    slide: { maxWidth: 1920, maxHeight: 1080, quality: 0.82 },
    /** Post highlight images (cards + post header + Open Graph). */
    highlight: { maxWidth: 1600, maxHeight: 1600, quality: 0.82 },
    /** Images placed inside post / hero-section content. */
    content: { maxWidth: 1600, maxHeight: 1600, quality: 0.82 },
    /** Department logos (shown up to ~256 px). */
    logo: { maxWidth: 512, maxHeight: 512, quality: 0.9 },
    /** Org chart member photos (shown up to ~160 px). */
    portrait: { maxWidth: 480, maxHeight: 480, quality: 0.85 },
    /** Logos / images placed as carousel layers. */
    layer: { maxWidth: 1200, maxHeight: 1200, quality: 0.88 },
} as const satisfies Record<string, ImageTarget>;

export type ImageTargetName = keyof typeof IMAGE_TARGETS;

const PASS_THROUGH = new Set(['image/gif', 'image/svg+xml']);

/** Largest size that fits inside the box without upscaling (integers, at least 1 px). */
export function fitWithin(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number,
): { width: number; height: number } {
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** `photo.JPG` -> `photo.webp`; empty or extension-less names get a default stem. */
export function webpName(name: string): string {
    const stem = name.replace(/\.[^./\\]+$/, '').trim();
    return `${stem || 'image'}.webp`;
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob | null> {
    if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/webp', quality }).catch(() => null);
    const { promise, resolve } = Promise.withResolvers<Blob | null>();
    canvas.toBlob(resolve, 'image/webp', quality);
    return promise;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/**
 * Downscales `source` into the target box and encodes WebP. Returns null when the browser cannot
 * encode WebP so callers can keep their original bytes.
 */
export async function encodeWebp(
    source: CanvasImageSource & { width: number; height: number },
    target: ImageTarget,
): Promise<{ blob: Blob; width: number; height: number; resized: boolean } | null> {
    const { width, height } = fitWithin(source.width, source.height, target.maxWidth, target.maxHeight);
    const canvas = makeCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, target.quality);
    if (!blob || blob.type !== 'image/webp') return null;
    return { blob, width, height, resized: width !== source.width || height !== source.height };
}

/** Compresses an uploaded file to WebP for `target`; returns the original file when that is better. */
export async function compressImage(file: File, targetName: ImageTargetName): Promise<File> {
    if (!file.type.startsWith('image/') || PASS_THROUGH.has(file.type)) return file;
    let bitmap: ImageBitmap;
    try {
        // `from-image` applies EXIF orientation so phone photos are not rotated.
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return file;
    }
    try {
        const encoded = await encodeWebp(bitmap, IMAGE_TARGETS[targetName]);
        if (!encoded) return file;
        if (!encoded.resized && encoded.blob.size >= file.size) return file;
        return new File([encoded.blob], webpName(file.name), { type: 'image/webp', lastModified: Date.now() });
    } finally {
        bitmap.close();
    }
}
