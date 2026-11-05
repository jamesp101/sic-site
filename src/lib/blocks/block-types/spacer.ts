import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { pick } from '../render-kit';

const SIZE = { sm: 'h-2', md: 'h-6', lg: 'h-12', xl: 'h-20' } as const;

export const spacer: BlockTypeModule<'spacer'> = {
    meta: { label: 'Spacer', group: 'Layout', description: 'Vertical whitespace.' },
    defaults: () => ({ size: 'md' }),
    schema: z.object({ size: z.enum(['sm', 'md', 'lg', 'xl']).default('md') }),
    html(block, ctx) {
        return `<div class="${pick(SIZE, block.props.size, 'md')}" aria-hidden="true"${ctx.hooks(block)}></div>`;
    },
    text: () => [],
};
