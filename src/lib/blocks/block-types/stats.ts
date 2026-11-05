import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc } from '../render-kit';
import { str } from '../schema-kit';
import { isObject, itemsOf, textOf } from '../text-kit';
import { LIMITS } from '../types';

export const stats: BlockTypeModule<'stats'> = {
    meta: { label: 'Stats', group: 'Content', description: 'Key figures with labels.' },
    defaults: () => ({
        items: [
            { value: '100+', label: 'Label', hint: '' },
            { value: '25', label: 'Label', hint: '' },
        ],
    }),
    schema: z.object({
        items: z
            .array(z.object({ value: str(80), label: str(120), hint: str(200) }))
            .max(LIMITS.statItems)
            .default([]),
    }),
    html(block, ctx) {
        const items = block.props.items.filter((item) => item.value.trim() || item.label.trim());
        if (items.length === 0) return '';
        const html = items
            .map(
                (item) =>
                    `<div class="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5 text-center shadow-brand-sm"><dt class="order-2 text-sm font-medium text-muted-foreground">${esc(item.label)}</dt><dd class="order-1 text-3xl font-bold text-primary">${esc(item.value)}</dd>${item.hint.trim() ? `<dd class="order-3 text-xs text-muted-foreground">${esc(item.hint)}</dd>` : ''}</div>`,
            )
            .join('');
        return `<dl class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4"${ctx.hooks(block)}>${html}</dl>`;
    },
    text: (props) =>
        itemsOf(props.items).flatMap((item) => (isObject(item) ? [`${textOf(item.value)} ${textOf(item.label)}`] : [])),
};
