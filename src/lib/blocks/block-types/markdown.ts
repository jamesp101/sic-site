import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { parseMarkdown } from '../../markdown';
import { stripMarkdown } from '../../markdown-strip';
import { str } from '../schema-kit';
import { textOf } from '../text-kit';
import { LIMITS } from '../types';

export const markdown: BlockTypeModule<'markdown'> = {
    meta: { label: 'Markdown (legacy)', group: 'Legacy', description: 'Markdown / MDX-lite source.' },
    defaults: () => ({ source: '' }),
    schema: z.object({ source: str(LIMITS.markdown) }),
    html(block, ctx) {
        const html = parseMarkdown(block.props.source);
        if (!html && !ctx.editor) return '';
        return `<div${ctx.hooks(block)}>${html || '<p class="text-sm text-muted-foreground">Empty Markdown block.</p>'}</div>`;
    },
    text: (props) => [stripMarkdown(textOf(props.source))],
};
