import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc } from '../render-kit';
import { label, url } from '../schema-kit';
import { isExternalHref, safeHref, safeImageSrc } from '../urls';

export const image: BlockTypeModule<'image'> = {
    meta: {
        label: 'Image',
        group: 'Media',
        description: 'Uploaded or linked image with alt text, caption and link.',
    },
    defaults: () => ({ src: '', alt: '', decorative: false, caption: '', width: null, height: null, link: '' }),
    schema: z.object({
        src: url,
        alt: label,
        decorative: z.boolean().default(false),
        caption: label,
        width: z.number().int().min(1).max(20_000).nullable().default(null),
        height: z.number().int().min(1).max(20_000).nullable().default(null),
        link: url,
    }),
    rules(props, report) {
        if (!props.src) report('Choose an image.', ['src']);
        else if (!safeImageSrc(props.src)) report('This image address is not allowed.', ['src']);
        if (!props.decorative && !props.alt.trim()) {
            report('Describe the image in the alt text, or mark it as decorative.', ['alt']);
        }
        if (props.link) {
            if (!safeHref(props.link)) report('Enter a valid link (https://, /path, mailto: or tel:).', ['link']);
            else if (props.decorative) report('A linked image needs alt text that names the link target.', ['link']);
        }
    },
    html(block, ctx) {
        const p = block.props;
        const src = safeImageSrc(p.src);
        if (src === null)
            return ctx.editor
                ? `<figure class="rounded-xl border border-dashed border-border-strong bg-surface-alt p-8 text-center text-sm text-muted-foreground"${ctx.hooks(block)}>Choose an image in the inspector.</figure>`
                : '';
        const alt = p.decorative ? '' : p.alt;
        const size =
            Number.isInteger(p.width) && Number.isInteger(p.height) && p.width! > 0 && p.height! > 0
                ? ` width="${p.width}" height="${p.height}"`
                : '';
        const caption = p.caption.trim()
            ? `<figcaption class="mt-2 text-sm text-muted-foreground">${esc(p.caption)}</figcaption>`
            : '';
        const img = `<img src="${esc(src)}" alt="${esc(alt)}"${size} loading="lazy" decoding="async" class="h-auto max-w-full rounded-xl">`;
        const href = p.link ? safeHref(p.link) : null;
        const linked =
            href === null
                ? img
                : isExternalHref(href)
                  ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="inline-block rounded-xl">${img}<span class="sr-only"> (opens in a new tab)</span></a>`
                  : `<a href="${esc(href)}" class="inline-block rounded-xl">${img}</a>`;
        return `<figure${ctx.hooks(block)}>${linked}${caption}</figure>`;
    },
    text: () => [],
};
