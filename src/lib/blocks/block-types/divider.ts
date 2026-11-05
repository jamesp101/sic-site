import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { pick } from '../render-kit';

const TONE = { default: 'border-border', strong: 'border-border-strong', gold: 'border-gold-500' } as const;

export const divider: BlockTypeModule<'divider'> = {
    meta: { label: 'Divider', group: 'Layout', description: 'A horizontal rule.' },
    defaults: () => ({ tone: 'default' }),
    schema: z.object({ tone: z.enum(['default', 'strong', 'gold']).default('default') }),
    html(block, ctx) {
        return `<div class="py-1"${ctx.hooks(block)}><hr class="${pick(TONE, block.props.tone, 'default')}"></div>`;
    },
    text: () => [],
};
