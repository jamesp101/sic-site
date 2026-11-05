import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, paragraphsHtml } from '../render-kit';
import { body, label } from '../schema-kit';
import { richOf, textOf } from '../text-kit';

const TONE = {
    info: { box: 'border-status-event-fg/30 bg-status-event-bg text-status-event-fg', label: 'Note' },
    success: { box: 'border-status-article-fg/30 bg-status-article-bg text-status-article-fg', label: 'Success' },
    warning: { box: 'border-gold-500/40 bg-gold-500/10 text-foreground', label: 'Warning' },
} as const;

export const callout: BlockTypeModule<'callout'> = {
    meta: { label: 'Callout', group: 'Content', description: 'Info, success or warning notice.' },
    defaults: () => ({ tone: 'info', title: 'Good to know', text: 'Important information goes here.' }),
    schema: z.object({ tone: z.enum(['info', 'success', 'warning']).default('info'), title: label, text: body }),
    html(block, ctx) {
        const p = block.props;
        if (!p.title.trim() && !p.text.trim()) return '';
        const tone = Object.hasOwn(TONE, p.tone) ? TONE[p.tone] : TONE.info;
        const title = p.title.trim()
            ? `<p class="font-bold"><span class="sr-only">${tone.label}: </span>${esc(p.title)}</p>`
            : `<p class="sr-only">${tone.label}</p>`;
        return `<div role="note" class="flex flex-col gap-1 rounded-xl border p-4 ${tone.box}"${ctx.hooks(block)}>${title}${paragraphsHtml(p.text, 'text-sm leading-relaxed')}</div>`;
    },
    text: (props) => [textOf(props.title), richOf(props.text)],
};
