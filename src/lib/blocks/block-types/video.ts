import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { esc } from '../render-kit';
import { label, url } from '../schema-kit';
import { parseVideoUrl } from '../urls';

export const video: BlockTypeModule<'video'> = {
    meta: { label: 'Video', group: 'Media', description: 'YouTube, Vimeo or an uploaded video.' },
    defaults: () => ({ url: '', title: '', caption: '' }),
    schema: z.object({ url, title: label, caption: label }),
    rules(props, report) {
        if (!parseVideoUrl(props.url)) report('Use a YouTube or Vimeo link, or an uploaded video.', ['url']);
        if (!props.title.trim()) report('Add a video title for screen readers.', ['title']);
    },
    html(block, ctx) {
        const p = block.props;
        const source = parseVideoUrl(p.url);
        if (!source || !p.title.trim()) return '';
        const caption = p.caption.trim()
            ? `<figcaption class="mt-2 text-sm text-muted-foreground">${esc(p.caption)}</figcaption>`
            : '';
        let frame: string;
        if (ctx.editor) {
            frame = `<div class="flex h-full w-full items-center justify-center p-4 text-center text-sm font-semibold text-muted-foreground">Video: ${esc(p.title)}</div>`;
        } else if (source.provider === 'file') {
            frame = `<video controls preload="metadata" playsinline aria-label="${esc(p.title)}" title="${esc(p.title)}" class="h-full w-full bg-brand-950"><source src="${esc(source.embedUrl)}" type="${source.mime}"></video>`;
        } else {
            frame = `<iframe src="${esc(source.embedUrl)}" title="${esc(p.title)}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" class="h-full w-full"></iframe>`;
        }
        return `<figure${ctx.hooks(block)}><div class="aspect-video overflow-hidden rounded-xl border border-border bg-surface-alt">${frame}</div>${caption}</figure>`;
    },
    text: () => [],
};
