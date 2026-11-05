import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { GAP, joinClasses, pick } from '../render-kit';
import { gap } from '../schema-kit';

const TEMPLATE = {
    '2-equal': 'md:grid-cols-2',
    '2-wide-left': 'md:grid-cols-[2fr_1fr]',
    '2-wide-right': 'md:grid-cols-[1fr_2fr]',
    '3-equal': 'md:grid-cols-3',
    '3-wide-left': 'md:grid-cols-3',
    '3-wide-right': 'md:grid-cols-3',
} as const;

export const columns: BlockTypeModule<'columns'> = {
    meta: { label: 'Columns', group: 'Layout', description: 'Two or three side-by-side columns.' },
    container: true,
    defaults: () => ({ count: 2, ratio: 'equal', gap: 'lg' }),
    schema: z.object({
        count: z.union([z.literal(2), z.literal(3)]).default(2),
        ratio: z.enum(['equal', 'wide-left', 'wide-right']).default('equal'),
        gap: gap.default('lg'),
    }),
    html(block, ctx) {
        const p = block.props;
        const inner = ctx.children(block.children);
        if (!inner && !ctx.editor) return '';
        const count = p.count === 3 ? 3 : 2;
        const key = `${count}-${pick({ equal: 'equal', 'wide-left': 'wide-left', 'wide-right': 'wide-right' }, p.ratio, 'equal')}`;
        const classes = joinClasses(
            'grid grid-cols-1 [&>*]:min-w-0',
            pick(TEMPLATE, key, '2-equal'),
            pick(GAP, p.gap, 'lg'),
        );
        return `<div class="${classes}"${ctx.hooks(block, !inner)}>${inner}</div>`;
    },
    text: () => [],
};
