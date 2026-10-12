/**
 * Block document → semantic HTML. Pure TypeScript (no astro imports): runs during SSR, in tests and inside
 * the admin canvas, so the editor shows exactly what visitors get. Every string is escaped, every URL is
 * filtered, every colour is a design token and headings are clamped to h2–h4 (the page owns its single h1).
 * Tailwind finds the class names below by scanning this file.
 */
import { escapeHtml, parseMarkdown } from '../markdown';
import { eventDateKey, formatEventDay, formatEventTime, parseEventDate, type EventDate } from './event-date';
import { inlineToHtml, paragraphsOf } from './inline';
import type { Block, BlockDocument, PropsByType, BlockType } from './types';
import { BLOCK_META } from './types';
import { isExternalHref, parseVideoUrl, safeHref, safeImageSrc } from './urls';

export interface RenderOptions {
    /** Adds `data-block-*` hooks, drop-target hints and video placeholders for the admin canvas. */
    editor?: boolean;
}

const GAP = { none: 'gap-0', sm: 'gap-2', md: 'gap-4', lg: 'gap-8' } as const;
const TEXT_ALIGN = { inherit: '', left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY_SELF = {
    inherit: 'justify-start',
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
} as const;

const SECTION_BG = {
    none: '',
    surface: 'border border-border bg-surface',
    alt: 'bg-surface-alt',
    accent: 'bg-accent',
    gold: 'border border-gold-500/30 bg-gold-500/10',
} as const;
const SECTION_PAD = { none: '', sm: 'p-4', md: 'p-6 md:p-8', lg: 'p-8 md:p-12' } as const;

const ROW_DIRECTION = {
    row: 'flex-row',
    column: 'flex-col',
    responsive: 'flex-col md:flex-row md:[&>*]:flex-1',
} as const;
const ROW_ALIGN = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' } as const;
const ROW_JUSTIFY = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
} as const;

const GRID_COLUMNS = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
} as const;
const COLUMNS_TEMPLATE = {
    '2-equal': 'md:grid-cols-2',
    '2-wide-left': 'md:grid-cols-[2fr_1fr]',
    '2-wide-right': 'md:grid-cols-[1fr_2fr]',
    '3-equal': 'md:grid-cols-3',
    '3-wide-left': 'md:grid-cols-3',
    '3-wide-right': 'md:grid-cols-3',
} as const;

const SPACER = { sm: 'h-2', md: 'h-6', lg: 'h-12', xl: 'h-20' } as const;
const DIVIDER = { default: 'border-border', strong: 'border-border-strong', gold: 'border-gold-500' } as const;

const HEADING = {
    2: 'text-2xl font-bold text-primary',
    3: 'text-xl font-bold text-primary',
    4: 'text-lg font-semibold text-primary',
} as const;
const PARAGRAPH_SIZE = { sm: 'text-sm', base: 'text-base', lg: 'text-lg' } as const;
const PARAGRAPH_TONE = { default: 'text-foreground', muted: 'text-muted-foreground' } as const;

const BUTTON_BASE =
    'inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors';
const BUTTON = {
    primary: `${BUTTON_BASE} bg-brand-800 text-white shadow-brand-sm hover:bg-brand-700 dark:bg-gold-500 dark:text-brand-950 dark:hover:bg-gold-400`,
    secondary: `${BUTTON_BASE} border border-border-strong bg-surface text-foreground shadow-brand-sm hover:bg-surface-alt`,
    ghost: `${BUTTON_BASE} text-link hover:bg-accent`,
} as const;

const CALLOUT = {
    info: { box: 'border-status-event-fg/30 bg-status-event-bg text-status-event-fg', label: 'Note' },
    success: { box: 'border-status-article-fg/30 bg-status-article-bg text-status-article-fg', label: 'Success' },
    warning: { box: 'border-gold-500/40 bg-gold-500/10 text-foreground', label: 'Warning' },
} as const;

const CHEVRON =
    '<svg class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const esc = escapeHtml;

/** Lookup that never returns inherited/undefined entries for odd stored values. */
function pick<T extends Record<string, string>>(table: T, key: unknown, fallback: keyof T): string {
    return typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : table[fallback];
}

function joinClasses(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

interface Ctx {
    editor: boolean;
}

function hooks(block: Block, ctx: Ctx, empty = false): string {
    if (!ctx.editor) return '';
    const meta = BLOCK_META[block.type];
    return ` data-block-id="${esc(block.id)}" data-block-type="${block.type}" data-block-label="${esc(meta.label)}"${empty ? ' data-empty="true"' : ''}`;
}

function paragraphsHtml(text: string, className: string): string {
    return paragraphsOf(text)
        .map((part) => `<p class="${className}">${inlineToHtml(part)}</p>`)
        .join('');
}

function renderChildren(children: Block[] | undefined, ctx: Ctx): string {
    return (children ?? []).map((child) => renderBlock(child, ctx)).join('');
}

function flow(inner: string, gap = 'gap-4'): string {
    return `<div class="flex flex-col ${gap}">${inner}</div>`;
}

function dateRange(start: EventDate, end: EventDate | null): string {
    const time = (date: EventDate, text: string) => `<time datetime="${esc(date.iso)}">${esc(text)}</time>`;
    const day = formatEventDay(start);
    const startTime = formatEventTime(start);
    if (!end) return time(start, startTime ? `${day}, ${startTime}` : day);
    const sameDay = formatEventDay(end) === day;
    const endTime = formatEventTime(end);
    if (sameDay && startTime && endTime) {
        return `${time(start, `${day}, ${startTime}`)} – ${time(end, endTime)}`;
    }
    if (sameDay && !startTime) return time(start, day);
    return `${time(start, startTime ? `${day}, ${startTime}` : day)} – ${time(end, `${formatEventDay(end)}${endTime ? `, ${endTime}` : ''}`)}`;
}

type Renderer<T extends BlockType> = (block: Extract<Block, { type: T }>, ctx: Ctx) => string;

const RENDERERS: { [T in BlockType]: Renderer<T> } = {
    section(block, ctx) {
        const p = block.props;
        const inner = renderChildren(block.children, ctx);
        if (!inner && !ctx.editor) return '';
        const classes = joinClasses(
            'rounded-2xl',
            pick(SECTION_BG, p.background, 'alt'),
            pick(SECTION_PAD, p.padding, 'md'),
            pick(TEXT_ALIGN, p.align, 'inherit'),
        );
        return `<section class="${classes}"${hooks(block, ctx, !inner)}>${flow(inner, 'gap-5')}</section>`;
    },

    row(block, ctx) {
        const p = block.props;
        const inner = renderChildren(block.children, ctx);
        if (!inner && !ctx.editor) return '';
        const classes = joinClasses(
            'flex [&>*]:min-w-0',
            pick(ROW_DIRECTION, p.direction, 'responsive'),
            pick(GAP, p.gap, 'md'),
            pick(ROW_ALIGN, p.align, 'stretch'),
            pick(ROW_JUSTIFY, p.justify, 'start'),
            p.wrap === true && 'flex-wrap',
        );
        return `<div class="${classes}"${hooks(block, ctx, !inner)}>${inner}</div>`;
    },

    grid(block, ctx) {
        const p = block.props;
        const inner = renderChildren(block.children, ctx);
        if (!inner && !ctx.editor) return '';
        const classes = joinClasses(
            'grid [&>*]:min-w-0',
            pick(GRID_COLUMNS as Record<string, string>, String(p.columns), '3'),
            pick(GAP, p.gap, 'md'),
        );
        return `<div class="${classes}"${hooks(block, ctx, !inner)}>${inner}</div>`;
    },

    columns(block, ctx) {
        const p = block.props;
        const inner = renderChildren(block.children, ctx);
        if (!inner && !ctx.editor) return '';
        const count = p.count === 3 ? 3 : 2;
        const key = `${count}-${pick({ equal: 'equal', 'wide-left': 'wide-left', 'wide-right': 'wide-right' }, p.ratio, 'equal')}`;
        const classes = joinClasses(
            'grid grid-cols-1 [&>*]:min-w-0',
            pick(COLUMNS_TEMPLATE, key, '2-equal'),
            pick(GAP, p.gap, 'lg'),
        );
        return `<div class="${classes}"${hooks(block, ctx, !inner)}>${inner}</div>`;
    },

    spacer(block, ctx) {
        return `<div class="${pick(SPACER, block.props.size, 'md')}" aria-hidden="true"${hooks(block, ctx)}></div>`;
    },

    divider(block, ctx) {
        return `<div class="py-1"${hooks(block, ctx)}><hr class="${pick(DIVIDER, block.props.tone, 'default')}"></div>`;
    },

    heading(block, ctx) {
        const p = block.props;
        if (!p.text.trim()) return '';
        // Never h1 (the page owns it) and never below h4 in this document model.
        const level = p.level === 3 || p.level === 4 ? p.level : 2;
        const classes = joinClasses(HEADING[level], pick(TEXT_ALIGN, p.align, 'inherit'));
        return `<h${level} class="${classes}"${hooks(block, ctx)}>${esc(p.text)}</h${level}>`;
    },

    paragraph(block, ctx) {
        const p = block.props;
        if (!p.text.trim())
            return ctx.editor ? `<p class="text-base text-muted-foreground"${hooks(block, ctx)}>&nbsp;</p>` : '';
        const classes = joinClasses(
            'leading-relaxed',
            pick(PARAGRAPH_SIZE, p.size, 'base'),
            pick(PARAGRAPH_TONE, p.tone, 'default'),
            pick(TEXT_ALIGN, p.align, 'inherit'),
        );
        return `<p class="${classes}"${hooks(block, ctx)}>${inlineToHtml(p.text)}</p>`;
    },

    list(block, ctx) {
        const p = block.props;
        const items = p.items.filter((item) => item.trim());
        if (items.length === 0) return '';
        const tag = p.ordered ? 'ol' : 'ul';
        const classes = p.ordered
            ? 'list-decimal space-y-1 pl-6 text-foreground marker:text-gold-600'
            : 'list-disc space-y-1 pl-6 text-foreground marker:text-gold-600';
        const lis = items.map((item) => `<li class="leading-relaxed">${inlineToHtml(item)}</li>`).join('');
        return `<${tag} class="${classes}"${hooks(block, ctx)}>${lis}</${tag}>`;
    },

    quote(block, ctx) {
        const p = block.props;
        if (!p.text.trim()) return '';
        const cite = p.cite.trim()
            ? `<footer class="mt-2 text-sm font-semibold not-italic text-foreground">— ${esc(p.cite)}</footer>`
            : '';
        return `<blockquote class="border-l-4 border-gold-500 pl-4 italic text-muted-foreground"${hooks(block, ctx)}>${paragraphsHtml(p.text, 'leading-relaxed')}${cite}</blockquote>`;
    },

    button(block, ctx) {
        const p = block.props;
        const href = safeHref(p.href);
        if (!p.label.trim() || href === null) return '';
        const external = isExternalHref(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<div class="flex ${pick(JUSTIFY_SELF, p.align, 'left')}"${hooks(block, ctx)}><a href="${esc(href)}" class="${pick(BUTTON, p.variant, 'primary')}"${external}>${esc(p.label)}</a></div>`;
    },

    badges(block, ctx) {
        const items = block.props.items.map((item) => item.trim()).filter(Boolean);
        if (items.length === 0) return '';
        const lis = items
            .map(
                (item) =>
                    `<li class="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">${esc(item)}</li>`,
            )
            .join('');
        return `<ul class="flex flex-wrap gap-1.5"${hooks(block, ctx)}>${lis}</ul>`;
    },

    card(block, ctx) {
        const p = block.props;
        const image = safeImageSrc(p.imageUrl);
        const href = p.linkLabel.trim() ? safeHref(p.linkHref) : null;
        const children = renderChildren(block.children, ctx);
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
        return `<article class="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-brand-sm"${hooks(block, ctx, !parts && !image)}>${img}<div class="flex flex-1 flex-col gap-3 p-6">${parts}</div></article>`;
    },

    image(block, ctx) {
        const p = block.props;
        const src = safeImageSrc(p.src);
        if (src === null)
            return ctx.editor
                ? `<figure class="rounded-xl border border-dashed border-border-strong bg-surface-alt p-8 text-center text-sm text-muted-foreground"${hooks(block, ctx)}>Choose an image in the inspector.</figure>`
                : '';
        const alt = p.decorative ? '' : p.alt;
        const size =
            Number.isInteger(p.width) && Number.isInteger(p.height) && p.width! > 0 && p.height! > 0
                ? ` width="${p.width}" height="${p.height}"`
                : '';
        const caption = p.caption.trim()
            ? `<figcaption class="mt-2 text-sm text-muted-foreground">${esc(p.caption)}</figcaption>`
            : '';
        return `<figure${hooks(block, ctx)}><img src="${esc(src)}" alt="${esc(alt)}"${size} loading="lazy" decoding="async" class="h-auto max-w-full rounded-xl">${caption}</figure>`;
    },

    table(block, ctx) {
        const p = block.props;
        const rows = p.rows.filter((row) => row.length > 0);
        if (rows.length === 0) return '';
        const th = (cell: string) =>
            `<th scope="col" class="border-b-2 border-border-strong bg-surface-alt px-4 py-2 text-left font-semibold text-primary">${inlineToHtml(cell)}</th>`;
        const td = (cell: string) =>
            `<td class="border-b border-border px-4 py-2 align-top text-foreground">${inlineToHtml(cell)}</td>`;
        const tr = (row: string[], cell: (value: string) => string) => `<tr>${row.map(cell).join('')}</tr>`;
        const head = p.header ? `<thead>${tr(rows[0], th)}</thead>` : '';
        const bodyRows = p.header ? rows.slice(1) : rows;
        const caption = p.caption.trim()
            ? `<caption class="caption-top pb-2 text-left text-sm font-semibold text-muted-foreground">${esc(p.caption)}</caption>`
            : '';
        return `<div class="overflow-x-auto"${hooks(block, ctx)}><table class="w-full border-collapse text-left text-sm">${caption}${head}<tbody>${bodyRows.map((row) => tr(row, td)).join('')}</tbody></table></div>`;
    },

    accordion(block, ctx) {
        const items = block.props.items.filter((item) => item.title.trim());
        if (items.length === 0) return '';
        const html = items
            .map(
                (item) =>
                    `<details class="group rounded-xl border border-border bg-surface-alt p-4"><summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-primary [&::-webkit-details-marker]:hidden"><span>${esc(item.title)}</span>${CHEVRON}</summary><div class="mt-3 flex flex-col gap-2">${paragraphsHtml(item.body, 'text-sm leading-relaxed text-muted-foreground')}</div></details>`,
            )
            .join('');
        return `<div class="flex flex-col gap-3"${hooks(block, ctx)}>${html}</div>`;
    },

    callout(block, ctx) {
        const p = block.props;
        if (!p.title.trim() && !p.text.trim()) return '';
        const tone = Object.hasOwn(CALLOUT, p.tone) ? CALLOUT[p.tone] : CALLOUT.info;
        const title = p.title.trim()
            ? `<p class="font-bold"><span class="sr-only">${tone.label}: </span>${esc(p.title)}</p>`
            : `<p class="sr-only">${tone.label}</p>`;
        return `<div role="note" class="flex flex-col gap-1 rounded-xl border p-4 ${tone.box}"${hooks(block, ctx)}>${title}${paragraphsHtml(p.text, 'text-sm leading-relaxed')}</div>`;
    },

    stats(block, ctx) {
        const items = block.props.items.filter((item) => item.value.trim() || item.label.trim());
        if (items.length === 0) return '';
        const html = items
            .map(
                (item) =>
                    `<div class="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5 text-center shadow-brand-sm"><dt class="order-2 text-sm font-medium text-muted-foreground">${esc(item.label)}</dt><dd class="order-1 text-3xl font-bold text-primary">${esc(item.value)}</dd>${item.hint.trim() ? `<dd class="order-3 text-xs text-muted-foreground">${esc(item.hint)}</dd>` : ''}</div>`,
            )
            .join('');
        return `<dl class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4"${hooks(block, ctx)}>${html}</dl>`;
    },

    video(block, ctx) {
        const p = block.props;
        const source = parseVideoUrl(p.url);
        if (!source || !p.title.trim()) return '';
        const caption = p.caption.trim()
            ? `<figcaption class="mt-2 text-sm text-muted-foreground">${esc(p.caption)}</figcaption>`
            : '';
        const frame = ctx.editor
            ? `<div class="flex h-full w-full items-center justify-center p-4 text-center text-sm font-semibold text-muted-foreground">Video: ${esc(p.title)}</div>`
            : `<iframe src="${esc(source.embedUrl)}" title="${esc(p.title)}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" class="h-full w-full"></iframe>`;
        return `<figure${hooks(block, ctx)}><div class="aspect-video overflow-hidden rounded-xl border border-border bg-surface-alt">${frame}</div>${caption}</figure>`;
    },

    event(block, ctx) {
        const p = block.props;
        const start = parseEventDate(p.start);
        const end = parseEventDate(p.end);
        if (!start && !p.location.trim() && !p.title.trim()) return '';
        const when = start
            ? `<div><dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</dt><dd class="mt-0.5 text-foreground">${dateRange(start, end && eventDateKey(end) >= eventDateKey(start) ? end : null)}</dd></div>`
            : '';
        const where = p.location.trim()
            ? `<div><dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</dt><dd class="mt-0.5 text-foreground">${esc(p.location)}</dd></div>`
            : '';
        const title = p.title.trim() ? `<p class="mb-3 text-lg font-bold text-primary">${esc(p.title)}</p>` : '';
        return `<div class="rounded-2xl border border-border bg-surface p-5 shadow-brand-sm"${hooks(block, ctx)}>${title}<dl class="grid gap-4 text-sm sm:grid-cols-2">${when}${where}</dl>${paragraphsHtml(p.note, 'mt-3 text-sm leading-relaxed text-muted-foreground')}</div>`;
    },

    markdown(block, ctx) {
        const html = parseMarkdown(block.props.source);
        if (!html && !ctx.editor) return '';
        return `<div${hooks(block, ctx)}>${html || '<p class="text-sm text-muted-foreground">Empty Markdown block.</p>'}</div>`;
    },
};

function renderBlock(block: Block, ctx: Ctx): string {
    const render = Object.hasOwn(RENDERERS, block.type)
        ? (RENDERERS[block.type] as unknown as Renderer<BlockType>)
        : null;
    const html = render ? render(block as never, ctx) : '';
    if (html || !ctx.editor) return html;
    // Blocks that render nothing publicly (e.g. an empty heading) still need a canvas element so they can be selected.
    return `<div class="rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground"${hooks(block, ctx)}>Empty ${esc(BLOCK_META[block.type].label.toLowerCase())}. Fill it in using the inspector.</div>`;
}

/** Renders a list of blocks inside the standard vertical flow wrapper. Returns `''` when nothing renders. */
export function renderBlocks(blocks: Block[], options: RenderOptions = {}): string {
    const inner = blocks.map((block) => renderBlock(block, { editor: options.editor === true })).join('');
    return inner ? `<div class="flex flex-col gap-5" data-sic-blocks>${inner}</div>` : '';
}

export function renderDocument(doc: BlockDocument, options: RenderOptions = {}): string {
    return renderBlocks(doc.blocks, options);
}

export type { PropsByType };
