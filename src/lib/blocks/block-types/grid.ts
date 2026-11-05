import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { GAP, joinClasses, pick } from '../render-kit';
import { gap } from '../schema-kit';

const COLUMNS = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
} as const;

export const grid: BlockTypeModule<'grid'> = {
    meta: { label: 'Grid', group: 'Layout', description: 'Responsive grid with 1 to 6 columns.' },
    container: true,
    defaults: () => ({ columns: 3, gap: 'md' }),
    schema: z.object({ columns: z.number().int().min(1).max(6).default(3), gap }),
    html(block, ctx) {
        const p = block.props;
        const inner = ctx.children(block.children);
        if (!inner && !ctx.editor) return '';
        const classes = joinClasses(
            'grid [&>*]:min-w-0',
            pick(COLUMNS as Record<string, string>, String(p.columns), '3'),
            pick(GAP, p.gap, 'md'),
        );
        return `<div class="${classes}"${ctx.hooks(block, !inner)}>${inner}</div>`;
    },
    text: () => [],
};
