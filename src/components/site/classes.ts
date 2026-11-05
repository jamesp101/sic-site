/** Shared Tailwind class strings for public components (tokens only, no hex colours). */
const button =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border py-3 text-xs font-semibold uppercase tracking-widest transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60';

const gold = 'border-transparent bg-gold-500 text-brand-950 shadow-brand-sm hover:bg-gold-400 hover:shadow-brand-md';
const primary =
    'border-transparent bg-primary text-primary-foreground shadow-brand-sm hover:opacity-90 hover:shadow-brand-md';

/** Gold call-to-action, navy text (sic.edu.ph `.btn-primary`). */
export const btnGold = `${button} px-6 ${gold}`;
/** Primary action on light/dark surfaces (navy in light mode, gold in dark mode). */
export const btnPrimary = `${button} px-6 ${primary}`;
/** Primary action inside a card or a form row: same look, tighter sides. */
export const btnPrimaryCompact = `${button} px-4 ${primary}`;
/** Neutral outlined button on page surfaces. */
export const btnOutline = `${button} px-6 border-border-strong bg-surface text-foreground hover:bg-surface-alt`;
/** Compact outlined button for secondary actions inside a card. */
export const btnOutlineCompact = `${button} px-4 border-border-strong bg-surface text-link hover:bg-surface-alt`;
/** Outlined button on navy backgrounds. */
export const btnOnDark = `${button} px-6 border-white/30 text-white hover:bg-white/10`;

export const field =
    'block min-h-11 w-full rounded-xl border border-input-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground';

export const card =
    'rounded-2xl border border-border bg-surface shadow-brand-sm transition duration-200 ease-out hover:shadow-brand-md motion-safe:hover:-translate-y-1 dark:border-border-strong';

/** Text link that stays a 44 px tap target on phones. */
export const textLink =
    'inline-flex min-h-11 items-center rounded text-sm font-semibold text-link underline-offset-4 hover:underline md:min-h-8';
