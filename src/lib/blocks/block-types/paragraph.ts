import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { inlineToHtml } from '../inline';
import { joinClasses, pick, TEXT_ALIGN } from '../render-kit';
import { body, textAlign } from '../schema-kit';
import { richOf } from '../text-kit';

const SIZE = { sm: 'text-sm', base: 'text-base', lg: 'text-lg' } as const;
const TONE = { default: 'text-foreground', muted: 'text-muted-foreground' } as const;

export const paragraph: BlockTypeModule<'paragraph'> = {
    meta: { label: 'Text', group: 'Content', description: 'Paragraph with bold, italic and links.' },
    defaults: () => ({ text: 'Write something here.', size: 'base', tone: 'default', align: 'inherit' }),
    schema: z.object({
        text: body,
        size: z.enum(['sm', 'base', 'lg']).default('base'),
        tone: z.enum(['default', 'muted']).default('default'),
        align: textAlign,
    }),
    html(block, ctx) {
        const p = block.props;
        if (!p.text.trim())
            return ctx.editor ? `<p class="text-base text-muted-foreground"${ctx.hooks(block)}>&nbsp;</p>` : '';
        const classes = joinClasses(
            'leading-relaxed',
            pick(SIZE, p.size, 'base'),
            pick(TONE, p.tone, 'default'),
            pick(TEXT_ALIGN, p.align, 'inherit'),
        );
        return `<p class="${classes}"${ctx.hooks(block)}>${inlineToHtml(p.text)}</p>`;
    },
    text: (props) => [richOf(props.text)],
    inline: { field: 'text', kind: 'rich' },
};
