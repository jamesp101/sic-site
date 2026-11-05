import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, flow, paragraphsHtml } from '../render-kit';
import { body, label, url } from '../schema-kit';
import { richOf, textOf } from '../text-kit';
import { isExternalHref, safeHref, safeImageSrc } from '../urls';

export const card: BlockTypeModule<'card'> = {
    meta: { label: 'Card', group: 'Content', description: 'Title, text, optional image and link.' },
    container: true,
    defaults: () => ({
        title: 'Card title',
        body: 'Short description of this card.',
        imageUrl: '',
        imageAlt: '',
        linkLabel: '',
        linkHref: '',
    }),
    schema: z.object({ title: label, body, imageUrl: url, imageAlt: label, linkLabel: label, linkHref: url }),
    rules(props, report) {
        if (props.imageUrl && !safeImageSrc(props.imageUrl)) report('This image address is not allowed.', ['imageUrl']);
        if (props.linkHref && !safeHref(props.linkHref)) report('Enter a valid link.', ['linkHref']);
        if (props.linkHref && !props.linkLabel.trim()) report('Give the card link a label.', ['linkLabel']);
    },
    html(block, ctx) {
        const p = block.props;
        const image = safeImageSrc(p.imageUrl);
        const href = p.linkLabel.trim() ? safeHref(p.linkHref) : null;
        const children = ctx.children(block.children);
        const parts = [
            p.title.trim() ? `<h3 class="text-lg font-bold text-primary">${esc(p.title)}</h3>` : '',
            paragraphsHtml(p.body, 'text-sm leading-relaxed text-muted-foreground'),
            children ? flow(children, 'gap-3') : '',
            href
                ? `<a href="${esc(href)}" class="mt-auto text-sm font-semibold text-link underline-offset-4 hover:underline"${isExternalHref(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(p.linkLabel)}<span aria-hidden="true"> →</span></a>`
                : '',
        ].join('');
        if (!parts && !image && !ctx.editor) return '';
        const img = image
            ? `<img src="${esc(image)}" alt="${esc(p.imageAlt)}" loading="lazy" decoding="async" class="aspect-video w-full object-cover">`
            : '';
        return `<article class="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-brand-sm"${ctx.hooks(block, !parts && !image)}>${img}<div class="flex flex-1 flex-col gap-3 p-6">${parts}</div></article>`;
    },
    text: (props) => [textOf(props.title), richOf(props.body)],
};
