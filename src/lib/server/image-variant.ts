import sharp from 'sharp';
import { webpName } from '../image-compress';
import { driver } from './storage';
import type { StorageDriver } from './storage/types';
import { CARD_WIDTH, variantKeyOf } from './storage/variants';

/** Decoding guard shared with `toWebp`: no decompression bombs. */
const MAX_INPUT_PIXELS = 8000 * 8000;
const VARIANT_QUALITY = 78;

/**
 * The card variant of an image (`CARD_WIDTH` wide at most, never upscaled), or null for an animated image,
 * which keeps its original.
 */
export async function cardVariantOf(bytes: Uint8Array): Promise<File | null> {
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
    const { pages } = await image.metadata();
    if ((pages ?? 1) > 1) return null;
    const out = await image
        .rotate()
        .resize({ width: CARD_WIDTH, withoutEnlargement: true })
        .webp({ quality: VARIANT_QUALITY })
        .toBuffer();
    return new File([new Uint8Array(out)], webpName('variant'), { type: 'image/webp' });
}

/**
 * Writes the card variant of the stored image `key` (given as `file`) and returns its key; null when the key
 * has no variant or the image is animated. Throws when the image cannot be decoded or stored.
 */
export async function putCardVariant(key: string, file: Blob, to: StorageDriver = driver): Promise<string | null> {
    const variantKey = variantKeyOf(key);
    if (!variantKey) return null;
    const variant = await cardVariantOf(new Uint8Array(await file.arrayBuffer()));
    if (!variant) return null;
    await to.put(variantKey, variant, 'image/webp');
    return variantKey;
}

export interface VariantBackfill {
    /** Variants written. */
    created: number;
    /** Originals that already had one. */
    existing: number;
    /** Originals left without (animated, or unreadable), with the reason. */
    skipped: { key: string; reason: string }[];
}

/** Creates the missing card variants of every stored image that should have one. Safe to run again. */
export async function backfillVariants(store: StorageDriver = driver): Promise<VariantBackfill> {
    const report: VariantBackfill = { created: 0, existing: 0, skipped: [] };
    const keys: string[] = [];
    for await (const object of store.list('posts/')) keys.push(object.key);
    for (const key of keys) {
        const variantKey = variantKeyOf(key);
        if (!variantKey) continue;
        if (await store.head(variantKey)) {
            report.existing++;
            continue;
        }
        try {
            const object = await store.get(key);
            if (!object) continue;
            const bytes = await new Response(object.body).arrayBuffer();
            const written = await putCardVariant(key, new Blob([bytes]), store);
            if (written) report.created++;
            else report.skipped.push({ key, reason: 'animated image' });
        } catch (error) {
            report.skipped.push({ key, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return report;
}
