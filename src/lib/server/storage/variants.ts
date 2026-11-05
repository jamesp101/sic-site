/**
 * Derived image variants: smaller WebPs stored next to an original under `<key without extension>.w<width>.webp`
 * (`posts/abc.webp` → `posts/abc.w640.webp`). Each kind of image has its own widths: Highlight images
 * (`posts/<name>`) 640 px for cards and the Post hero, Slide photos (`carousels/<name>`) 960 px for the first
 * paint. Variants are written in the same `commitWithFiles` commit as the original, removed with it, and kept by
 * the storage cleanup while the original is. Pure key logic, free of `astro:*` and of the storage driver.
 */

/** Width in pixels of the Highlight image variant. */
export const CARD_WIDTH = 640;
/** Width in pixels of the Slide photo variant. */
export const SLIDE_WIDTH = 960;

const IMAGE_TYPES = '(webp|jpe?g|png|gif|avif)';
/** Variant widths per image kind, by key. */
const KINDS: readonly { match: RegExp; widths: readonly number[] }[] = [
    { match: new RegExp(`^posts/[^/]+\\.${IMAGE_TYPES}$`, 'i'), widths: [CARD_WIDTH] },
    { match: new RegExp(`^carousels/[^/]+\\.${IMAGE_TYPES}$`, 'i'), widths: [SLIDE_WIDTH] },
];
const ALL_WIDTHS = KINDS.flatMap((kind) => kind.widths);
const VARIANT_SUFFIX = new RegExp(`\\.w(${ALL_WIDTHS.join('|')})\\.webp$`);
const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png', '.gif', '.avif'];

/** Key without its extension (`posts/a.webp` → `posts/a`). */
const stem = (key: string): string => key.replace(/\.[^./]+$/, '');

/** True for a key that is itself a variant. */
export function isVariantKey(key: string): boolean {
    return VARIANT_SUFFIX.test(key);
}

/** Widths of the variants an original has (empty for a key that is not an original of a kind that has them). */
export function variantWidths(key: string): readonly number[] {
    if (isVariantKey(key)) return [];
    return KINDS.find((kind) => kind.match.test(key))?.widths ?? [];
}

/** The variant key of an original at `width`, else null when its kind has no such variant. */
export function variantKeyOf(key: string, width: number): string | null {
    return variantWidths(key).includes(width) ? `${stem(key)}.w${width}.webp` : null;
}

/** Every variant key of an original (empty when it has none). */
export function variantKeysOf(key: string): string[] {
    return variantWidths(key).map((width) => `${stem(key)}.w${width}.webp`);
}

/** The key an original and its variants share, without extension or suffix (`posts/a`). */
export function variantBase(key: string): string {
    return isVariantKey(key) ? key.replace(VARIANT_SUFFIX, '') : stem(key);
}

/** Keys an original of `variantKey` may have, most likely first (the extension is not part of the variant key). */
export function originalCandidates(variantKey: string): string[] {
    const base = variantBase(variantKey);
    return IMAGE_EXTENSIONS.map((ext) => `${base}${ext}`);
}
