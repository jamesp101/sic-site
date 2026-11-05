import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, pick } from '../render-kit';
import { label, textAlign, url } from '../schema-kit';
import { isExternalHref, safeHref } from '../urls';

const JUSTIFY_SELF = {
    inherit: 'justify-start',
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
} as const;

const BASE = 'inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors';
const VARIANT = {
    primary: `${BASE} bg-brand-800 text-white shadow-brand-sm hover:bg-brand-700 dark:bg-gold-500 dark:text-brand-950 dark:hover:bg-gold-400`,
    secondary: `${BASE} border border-border-strong bg-surface text-foreground shadow-brand-sm hover:bg-surface-alt`,
    ghost: `${BASE} text-link hover:bg-accent`,
} as const;

export const button: BlockTypeModule<'button'> = {
    meta: { label: 'Button', group: 'Content', description: 'Link styled as a button.' },
    defaults: () => ({ label: 'Learn more', href: '/', variant: 'primary', align: 'left' }),
    schema: z.object({
        label,
        href: url,
        variant: z.enum(['primary', 'secondary', 'ghost']).default('primary'),
        align: textAlign,
    }),
    rules(props, report) {
        if (!props.label.trim()) report('Give the button a label.', ['label']);
        if (!safeHref(props.href)) report('Enter a valid link (https://, /path, mailto: or tel:).', ['href']);
    },
    html(block, ctx) {
        const p = block.props;
        const href = safeHref(p.href);
        if (!p.label.trim() || href === null) return '';
        const external = isExternalHref(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<div class="flex ${pick(JUSTIFY_SELF, p.align, 'left')}"${ctx.hooks(block)}><a href="${esc(href)}" class="${pick(VARIANT, p.variant, 'primary')}"${external}>${esc(p.label)}</a></div>`;
    },
    text: () => [],
    inline: { field: 'label', kind: 'plain', target: 'a' },
};
