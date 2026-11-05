import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, joinClasses, pick, TEXT_ALIGN } from '../render-kit';
import { label, textAlign } from '../schema-kit';
import { textOf } from '../text-kit';

const LEVEL = {
    2: 'text-2xl font-bold text-primary',
    3: 'text-xl font-bold text-primary',
    4: 'text-lg font-semibold text-primary',
} as const;

export const heading: BlockTypeModule<'heading'> = {
    meta: { label: 'Heading', group: 'Content', description: 'Section heading (h2 to h4).' },
    defaults: () => ({ text: 'Heading', level: 2, align: 'inherit' }),
    schema: z.object({
        text: label,
        level: z
            .union([z.literal(2), z.literal(3), z.literal(4)], { error: 'Headings can be level 2, 3 or 4.' })
            .default(2),
        align: textAlign,
    }),
    html(block, ctx) {
        const p = block.props;
        if (!p.text.trim()) return '';
        // Never h1 (the page owns it) and never below h4 in this document model.
        const level = p.level === 3 || p.level === 4 ? p.level : 2;
        const classes = joinClasses(LEVEL[level], pick(TEXT_ALIGN, p.align, 'inherit'));
        return `<h${level} class="${classes}"${ctx.hooks(block)}>${esc(p.text)}</h${level}>`;
    },
    text: (props) => [textOf(props.text)],
    inline: { field: 'text', kind: 'plain' },
};
