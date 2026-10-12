/** Shared Tailwind class strings for public components (tokens only, no hex colours). */
const button =
    'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-xs font-semibold uppercase tracking-widest transition duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60';

/** Gold call-to-action, navy text (sic.edu.ph `.btn-primary`). */
export const btnGold = `${button} bg-gold-500 text-brand-950 shadow-brand-sm hover:bg-gold-400 hover:shadow-brand-md`;
/** Primary action on light/dark surfaces (navy in light mode, gold in dark mode). */
export const btnPrimary = `${button} bg-primary text-primary-foreground shadow-brand-sm hover:opacity-90 hover:shadow-brand-md`;
/** Neutral outlined button on page surfaces. */
export const btnOutline = `${button} border border-border-strong bg-surface text-foreground hover:bg-surface-alt`;
/** Outlined button on navy backgrounds. */
export const btnOnDark = `${button} border border-white/30 text-white hover:bg-white/10`;

export const field =
    'block w-full rounded-xl border border-border-strong bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground';

export const card =
    'rounded-2xl border border-border bg-surface shadow-brand-sm transition duration-200 hover:-translate-y-1 hover:shadow-brand-md';

export const container = 'mx-auto w-full max-w-7xl px-6';
