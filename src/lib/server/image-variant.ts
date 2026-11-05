import { webpName } from '../image-compress';
import { MAX_INPUT_PIXELS } from './image-webp';
import { driver } from './storage';
import type { StorageDriver } from './storage/types';
import { variantKeyOf, variantKeysOf, variantWidths } from './storage/variants';

const VARIANT_QUALITY = 78;

/**
 * The `width` px variant of an image (never upscaled), or null for an animated image, which keeps its original.
 */
export async function variantOf(bytes: Uint8Array, width: number): Promise<File | null> {
    const { default: sharp } = await import('sharp');
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
    const { pages } = await image.metadata();
    if ((pages ?? 1) > 1) return null;
    const out = await image
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: VARIANT_QUALITY })
        .toBuffer();
    return new File([new Uint8Array(out)], webpName('variant'), { type: 'image/webp' });
}

/**
 * Writes the variants of the stored image `key` (given as `file`), except those in `skip`, and returns their keys;
 * empty when the key has none or the image is animated. Throws when the image cannot be decoded or stored.
 */
export async function putVariants(
    key: string,
    file: Blob,
    to: StorageDriver = driver,
    skip: ReadonlySet<string> = new Set(),
): Promise<string[]> {
    const widths = variantWidths(key).filter((width) => !skip.has(variantKeyOf(key, width) ?? ''));
    if (widths.length === 0) return [];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const written: string[] = [];
    for (const width of widths) {
        const variant = await variantOf(bytes, width);
        if (!variant) return written;
        const variantKey = variantKeyOf(key, width)!;
        await to.put(variantKey, variant, 'image/webp');
        written.push(variantKey);
    }
    return written;
}

export interface VariantBackfill {
    /** Variants written. */
    created: number;
    /** Variants that were already there. */
    existing: number;
    /** Originals left without (animated, or unreadable), with the reason. */
    skipped: { key: string; reason: string }[];
}

/** Prefixes whose every stored image has a variant: Highlight images, Department logos, Member portraits. */
const BACKFILL_PREFIXES = ['posts/', 'departments/', 'members/'];

/**
 * Creates the missing variants of every stored image that should have one: every Highlight image under `posts/`,
 * every Department logo and Member portrait, and the given Slide photo keys (`carousels/` also holds Layer images,
 * which have none). Safe to run again.
 */
export async function backfillVariants(
    store: StorageDriver = driver,
    slidePhotoKeys: Iterable<string> = [],
): Promise<VariantBackfill> {
    const report: VariantBackfill = { created: 0, existing: 0, skipped: [] };
    const keys = new Set<string>(slidePhotoKeys);
    for (const prefix of BACKFILL_PREFIXES) for await (const object of store.list(prefix)) keys.add(object.key);
    for (const key of keys) {
        const wanted = variantKeysOf(key);
        if (wanted.length === 0) continue;
        const present = new Set<string>();
        for (const variantKey of wanted) if (await store.head(variantKey)) present.add(variantKey);
        report.existing += present.size;
        if (present.size === wanted.length) continue;
        try {
            const object = await store.get(key);
            if (!object) continue;
            const bytes = await new Response(object.body).arrayBuffer();
            const written = await putVariants(key, new Blob([bytes]), store, present);
            report.created += written.length;
            if (written.length === 0) report.skipped.push({ key, reason: 'animated image' });
        } catch (error) {
            report.skipped.push({ key, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return report;
}
