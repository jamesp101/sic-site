/** 1-based page number from a `?page=` value; anything but a positive integer is page 1. */
export function parsePage(value: string | null): number {
    if (!value || !/^\d{1,6}$/.test(value)) return 1;
    return Math.max(1, Number(value));
}

/**
 * Page links to render for `current` of `count` pages: the first and last page, the current page
 * and its neighbours, with `null` where pages are skipped. A gap never hides a single page.
 */
export function pageWindow(current: number, count: number): (number | null)[] {
    const shown = new Set([1, count, current - 1, current, current + 1]);
    const pages: (number | null)[] = [];
    for (let page = 1; page <= count; page++) {
        // Show a lone skipped page instead of an ellipsis that would stand for just that page.
        const bridging = !shown.has(page) && shown.has(page - 1) && shown.has(page + 1);
        if (shown.has(page) || bridging) pages.push(page);
        else if (pages.at(-1) !== null) pages.push(null);
    }
    return pages;
}
