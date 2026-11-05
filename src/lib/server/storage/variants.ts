/**
 * Derived image variants: a smaller WebP stored next to an original under `<key without extension>.w640.webp`
 * (`posts/abc.webp` → `posts/abc.w640.webp`). Only Highlight images (`posts/<name>`) have one; it is written in
 * the same `commitWithFiles` commit as the original, removed with it, and kept by the storage cleanup while the
 * original is. Pure key logic, free of `astro:*` and of the storage driver.
 */

/** Width in pixels of the card variant. */
export const CARD_WIDTH = 640;

const SUFFIX = `.w${CARD_WIDTH}.webp`;
const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png', '.gif', '.avif'];
const WITH_VARIANT = /^posts\/[^/]+\.(webp|jpe?g|png|gif|avif)$/i;

/** Key without its extension (`posts/a.webp` → `posts/a`). */
const stem = (key: string): string => key.replace(/\.[^./]+$/, '');

/** True for a key that is itself a variant. */
export function isVariantKey(key: string): boolean {
    return key.endsWith(SUFFIX);
}

/** The variant key of an original that has one (a Highlight image), else null. */
export function variantKeyOf(key: string): string | null {
    return WITH_VARIANT.test(key) && !isVariantKey(key) ? `${stem(key)}${SUFFIX}` : null;
}

/** The key an original and its variant share, without extension or suffix (`posts/a`). */
export function variantBase(key: string): string {
    return isVariantKey(key) ? key.slice(0, -SUFFIX.length) : stem(key);
}

/** Keys an original of `variantKey` may have, most likely first (the extension is not part of the variant key). */
export function originalCandidates(variantKey: string): string[] {
    const base = variantBase(variantKey);
    return IMAGE_EXTENSIONS.map((ext) => `${base}${ext}`);
}
