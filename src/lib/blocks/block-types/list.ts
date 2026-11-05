import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { inlineToHtml } from '../inline';
import { strings } from '../schema-kit';
import { itemsOf, richOf } from '../text-kit';
import { LIMITS } from '../types';

export const list: BlockTypeModule<'list'> = {
    meta: { label: 'List', group: 'Content', description: 'Bulleted or numbered list.' },
    defaults: () => ({ ordered: false, items: ['First item', 'Second item'] }),
    schema: z.object({
        ordered: z.boolean().default(false),
        items: strings(LIMITS.listItems, z.string().max(LIMITS.label)),
    }),
    html(block, ctx) {
        const p = block.props;
        const items = p.items.filter((item) => item.trim());
        if (items.length === 0) return '';
        const tag = p.ordered ? 'ol' : 'ul';
        const classes = p.ordered
            ? 'list-decimal space-y-1 pl-6 text-foreground marker:text-gold-600'
            : 'list-disc space-y-1 pl-6 text-foreground marker:text-gold-600';
        const lis = items.map((item) => `<li class="leading-relaxed">${inlineToHtml(item)}</li>`).join('');
        return `<${tag} class="${classes}"${ctx.hooks(block)}>${lis}</${tag}>`;
    },
    text: (props) => itemsOf(props.items).map(richOf),
};
