import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, paragraphsHtml } from '../render-kit';
import { body, label } from '../schema-kit';
import { isObject, itemsOf, richOf, textOf } from '../text-kit';
import { LIMITS } from '../types';

const CHEVRON =
    '<svg class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export const accordion: BlockTypeModule<'accordion'> = {
    meta: { label: 'Accordion / FAQ', group: 'Content', description: 'Expandable questions and answers.' },
    defaults: () => ({ items: [{ title: 'Question', body: 'Answer.' }] }),
    schema: z.object({
        items: z
            .array(z.object({ title: label, body }))
            .max(LIMITS.accordionItems)
            .default([]),
    }),
    rules(props, report) {
        if (props.items.length === 0) report('Add at least one item.', ['items']);
        if (props.items.some((item) => !item.title.trim())) report('Every item needs a title.', ['items']);
    },
    html(block, ctx) {
        const items = block.props.items.filter((item) => item.title.trim());
        if (items.length === 0) return '';
        const html = items
            .map(
                (item) =>
                    `<details class="group rounded-xl border border-border bg-surface-alt p-4"><summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-primary [&::-webkit-details-marker]:hidden"><span>${esc(item.title)}</span>${CHEVRON}</summary><div class="mt-3 flex flex-col gap-2">${paragraphsHtml(item.body, 'text-sm leading-relaxed text-muted-foreground')}</div></details>`,
            )
            .join('');
        return `<div class="flex flex-col gap-3"${ctx.hooks(block)}>${html}</div>`;
    },
    text: (props) =>
        itemsOf(props.items).flatMap((item) => (isObject(item) ? [textOf(item.title), richOf(item.body)] : [])),
};
