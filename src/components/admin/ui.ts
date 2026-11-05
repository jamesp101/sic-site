/** Shared class strings for admin list/form pages (tokens only). */
export const cardClass = 'rounded-xl border border-border bg-surface shadow-brand-sm';
export const selectClass =
    'rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-foreground shadow-brand-sm outline-none focus:border-brand-600 focus-visible:ring-2 focus-visible:ring-ring';
/** Search box in a list's filter bar (the search icon sits at its left). */
export const searchInputClass =
    'w-full rounded-lg border border-input-border bg-surface py-2 pr-4 pl-10 text-sm text-foreground shadow-brand-sm outline-none placeholder:text-muted-foreground focus:border-brand-600 focus-visible:ring-2 focus-visible:ring-ring';
/** Page container: lists and editors (wide content). */
export const widePageClass = 'mx-auto w-full max-w-7xl space-y-6 p-6';
/** Page container: plain forms. */
export const formPageClass = 'mx-auto w-full max-w-3xl space-y-6 p-6';
export const iconLinkClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
export const thClass = 'px-6 py-3 text-xs font-bold tracking-wide text-muted-foreground uppercase';
export const eyebrowClass =
    'flex items-center gap-2 text-xs font-semibold tracking-widest text-link uppercase before:h-0.5 before:w-6 before:bg-gold-500 before:content-[""]';

export function formatDate(iso: string | Date | null | undefined, withTime = false): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(
        'en-PH',
        withTime
            ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { year: 'numeric', month: 'short', day: 'numeric' },
    );
}
