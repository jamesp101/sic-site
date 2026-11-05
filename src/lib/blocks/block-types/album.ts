import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc, pick } from '../render-kit';
import { label, url } from '../schema-kit';
import { isObject, itemsOf, textOf } from '../text-kit';
import { LIMITS } from '../types';
import { safeImageSrc } from '../urls';

/** Hooks the public lightbox script (`src/scripts/lightbox.ts`) binds to; see `hasAlbum` in `content.ts`. */
export const ALBUM_ATTR = 'data-album';
export const ALBUM_ITEM_ATTR = 'data-album-item';

const COLUMNS = {
    '2': 'grid-cols-2',
    '3': 'grid-cols-2 sm:grid-cols-3',
    '4': 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
} as const;

export const album: BlockTypeModule<'album'> = {
    meta: { label: 'Album', group: 'Media', description: 'Image grid that opens in a lightbox.' },
    defaults: () => ({ images: [], columns: 3 }),
    schema: z.object({
        images: z
            .array(z.object({ src: url, alt: label, caption: label }))
            .max(LIMITS.albumImages, `An album holds at most ${LIMITS.albumImages} images.`)
            .default([]),
        columns: z
            .union([z.literal(2), z.literal(3), z.literal(4)], { error: 'Albums have 2, 3 or 4 columns.' })
            .default(3),
    }),
    rules(props, report) {
        if (props.images.length === 0) report('Add at least one image.', ['images']);
        props.images.forEach((image, index) => {
            const at = ['images', index];
            if (!image.src) report(`Image ${index + 1}: choose an image.`, [...at, 'src']);
            else if (!safeImageSrc(image.src))
                report(`Image ${index + 1}: this image address is not allowed.`, [...at, 'src']);
            if (!image.alt.trim()) report(`Image ${index + 1}: describe the image in the alt text.`, [...at, 'alt']);
        });
    },
    html(block, ctx) {
        const p = block.props;
        const images = p.images.flatMap((image) => {
            const src = safeImageSrc(image.src);
            return src === null ? [] : [{ src, alt: image.alt, caption: image.caption.trim() }];
        });
        if (images.length === 0)
            return ctx.editor
                ? `<figure class="rounded-xl border border-dashed border-border-strong bg-surface-alt p-8 text-center text-sm text-muted-foreground"${ctx.hooks(block)}>Add images in the inspector.</figure>`
                : '';
        const items = images
            .map(
                (image) =>
                    `<li><a href="${esc(image.src)}" ${ALBUM_ITEM_ATTR}${image.caption ? ` data-caption="${esc(image.caption)}"` : ''} class="block overflow-hidden rounded-xl border border-border bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><img src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy" decoding="async" class="aspect-square w-full object-cover transition-transform motion-safe:hover:scale-105"></a></li>`,
            )
            .join('');
        return `<div ${ALBUM_ATTR}${ctx.hooks(block)}><ul class="grid ${pick(COLUMNS as Record<string, string>, String(p.columns), '3')} gap-3">${items}</ul></div>`;
    },
    text: (props) =>
        itemsOf(props.images).flatMap((image) => (isObject(image) ? [textOf(image.alt), textOf(image.caption)] : [])),
};
