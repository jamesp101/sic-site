import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { flow, joinClasses, pick, TEXT_ALIGN } from '../render-kit';
import { textAlign } from '../schema-kit';

const BACKGROUND = {
    none: '',
    surface: 'border border-border bg-surface',
    alt: 'bg-surface-alt',
    accent: 'bg-accent',
    gold: 'border border-gold-500/30 bg-gold-500/10',
} as const;
const PADDING = { none: '', sm: 'p-4', md: 'p-6 md:p-8', lg: 'p-8 md:p-12' } as const;

export const section: BlockTypeModule<'section'> = {
    meta: { label: 'Section', group: 'Layout', description: 'Background and padding around other elements.' },
    container: true,
    rootOnly: true,
    defaults: () => ({ background: 'alt', padding: 'md', align: 'inherit' }),
    schema: z.object({
        background: z.enum(['none', 'surface', 'alt', 'accent', 'gold']).default('alt'),
        padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
        align: textAlign,
    }),
    html(block, ctx) {
        const p = block.props;
        const inner = ctx.children(block.children);
        if (!inner && !ctx.editor) return '';
        const classes = joinClasses(
            'rounded-2xl',
            pick(BACKGROUND, p.background, 'alt'),
            pick(PADDING, p.padding, 'md'),
            pick(TEXT_ALIGN, p.align, 'inherit'),
        );
        return `<section class="${classes}"${ctx.hooks(block, !inner)}>${flow(inner, 'gap-5')}</section>`;
    },
    text: () => [],
};
