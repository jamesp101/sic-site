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

/**
 * Slugifies `base` (empty result becomes `fallback`) and appends `-1`, `-2`, … until
 * `exists` reports the candidate as free.
 */
export async function uniqueSlug(
    base: string,
    exists: (slug: string) => Promise<boolean>,
    fallback = 'post',
): Promise<string> {
    const root = slugify(base) || fallback;
    let slug = root;
    let count = 1;
    while (await exists(slug)) slug = `${root}-${count++}`;
    return slug;
}
