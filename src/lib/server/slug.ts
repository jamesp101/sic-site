/** URL slug helpers. Free of `astro:*` imports so they are unit-testable and shareable. */

/** Lower-case ASCII slug: accents stripped, every other run of characters becomes one `-`, no edge dashes. */
export function slugify(input: string): string {
    return input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Longest slug root: leaves room for a `-<n>` suffix inside the 255-character slug columns. */
const MAX_ROOT = 240;

/**
 * Slugifies `base` (empty result becomes `fallback`), cut to `MAX_ROOT` characters, and appends `-1`,
 * `-2`, … until `exists` reports the candidate as free.
 */
export async function uniqueSlug(
    base: string,
    exists: (slug: string) => Promise<boolean>,
    fallback = 'post',
): Promise<string> {
    const root = slugify(base).slice(0, MAX_ROOT).replace(/-+$/, '') || fallback;
    let slug = root;
    let count = 1;
    while (await exists(slug)) slug = `${root}-${count++}`;
    return slug;
}
