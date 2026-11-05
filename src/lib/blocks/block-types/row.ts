import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { GAP, joinClasses, pick } from '../render-kit';
import { gap } from '../schema-kit';

const DIRECTION = {
    row: 'flex-row',
    column: 'flex-col',
    responsive: 'flex-col md:flex-row md:[&>*]:flex-1',
} as const;
const ALIGN = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' } as const;
const JUSTIFY = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
} as const;

export const row: BlockTypeModule<'row'> = {
    meta: { label: 'Row / Flex', group: 'Layout', description: 'Flexible row or column with gap and alignment.' },
    container: true,
    defaults: () => ({ direction: 'responsive', gap: 'md', align: 'stretch', justify: 'start', wrap: false }),
    schema: z.object({
        direction: z.enum(['row', 'column', 'responsive']).default('responsive'),
        gap,
        align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
        justify: z.enum(['start', 'center', 'end', 'between']).default('start'),
        wrap: z.boolean().default(false),
    }),
    html(block, ctx) {
        const p = block.props;
        const inner = ctx.children(block.children);
        if (!inner && !ctx.editor) return '';
        const classes = joinClasses(
            'flex [&>*]:min-w-0',
            pick(DIRECTION, p.direction, 'responsive'),
            pick(GAP, p.gap, 'md'),
            pick(ALIGN, p.align, 'stretch'),
            pick(JUSTIFY, p.justify, 'start'),
            p.wrap === true && 'flex-wrap',
        );
        return `<div class="${classes}"${ctx.hooks(block, !inner)}>${inner}</div>`;
    },
    text: () => [],
};
