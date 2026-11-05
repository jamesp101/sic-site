import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, paragraphsHtml } from '../render-kit';
import { body, label } from '../schema-kit';
import { richOf } from '../text-kit';

export const quote: BlockTypeModule<'quote'> = {
    meta: { label: 'Quote', group: 'Content', description: 'Highlighted quotation.' },
    defaults: () => ({ text: 'A memorable line.', cite: '' }),
    schema: z.object({ text: body, cite: label }),
    html(block, ctx) {
        const p = block.props;
        if (!p.text.trim()) return '';
        const cite = p.cite.trim()
            ? `<footer class="mt-2 text-sm font-semibold not-italic text-foreground">— ${esc(p.cite)}</footer>`
            : '';
        return `<blockquote class="border-l-4 border-gold-500 pl-4 italic text-muted-foreground"${ctx.hooks(block)}>${paragraphsHtml(p.text, 'leading-relaxed')}${cite}</blockquote>`;
    },
    text: (props) => [richOf(props.text)],
};
