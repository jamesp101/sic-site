/**
 * Lightweight Markdown + MDX-lite renderer. Pure functions, no server imports:
 * it runs during SSR, in tests and in the admin editor preview in the browser.
 *
 * - All text is HTML-escaped; only the MDX-lite tags below are turned into markup:
 *   <Card title="…">, <Center>, <Accordion title="…"> (rendered as <details>), <Badges>, <Flex>.
 * - Content headings are shifted one level down (`#` → h2 … capped at h6) so the page keeps its own h1.
 * - Output carries Tailwind token classes (no `prose`, no hard-coded colours).
 */

import { escapeHtml } from './escape-html';
import { isBlockDocument } from './blocks/document';
import { blocksToPlainText } from './blocks/plain-text';
import { stripMarkdown } from './markdown-strip';

const OPEN = '\uE000';
const CLOSE = '\uE001';
const SENTINEL_LINE = /^\uE000(\d+)\uE001$/;
const SENTINEL_ANY = /\uE000(\d+)\uE001/g;

const CLASSES = {
    heading: {
        2: 'mt-8 mb-3 text-2xl font-bold text-primary',
        3: 'mt-6 mb-2 text-xl font-bold text-primary',
        4: 'mt-5 mb-2 text-lg font-semibold text-primary',
        5: 'mt-4 mb-2 text-base font-semibold text-primary',
        6: 'mt-4 mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground',
    } as Record<number, string>,
    p: 'my-3 leading-relaxed text-foreground',
    ul: 'my-3 list-disc space-y-1 pl-6 text-foreground marker:text-gold-600',
    ol: 'my-3 list-decimal space-y-1 pl-6 text-foreground marker:text-gold-600',
    li: 'leading-relaxed',
    blockquote: 'my-4 border-l-4 border-gold-500 pl-4 italic text-muted-foreground',
    pre: 'my-4 overflow-x-auto rounded-lg border border-border bg-surface-alt p-4 font-mono text-sm text-foreground',
    code: 'rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[0.9em] text-foreground',
    strong: 'font-bold text-primary',
    em: 'italic',
    a: 'font-medium text-link underline-offset-2 hover:underline',
    img: 'my-4 h-auto max-w-full rounded-xl',
    card: 'my-6 rounded-2xl border border-border bg-surface p-6 shadow-brand-sm',
    cardTitle: 'mb-2 text-lg font-bold text-primary',
    cardBody: 'text-sm text-muted-foreground',
    center: 'my-6 flex flex-col items-center justify-center text-center',
    flex: 'my-6 flex flex-col items-stretch gap-6 md:flex-row',
    details: 'group my-4 rounded-xl border border-border bg-surface-alt p-4',
    summary: 'flex cursor-pointer list-none items-center justify-between font-semibold text-primary',
    chevron: 'h-4 w-4 transition-transform group-open:rotate-180',
    detailsBody: 'mt-3 text-sm text-muted-foreground',
    badges: 'my-2 flex flex-wrap gap-1.5',
    badge: 'inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700',
};

export { escapeHtml };

function safeUrl(url: string): string {
    // `url` is already HTML-escaped; reject script-capable schemes.
    return /^\s*(javascript|data|vbscript):/i.test(url) ? '#' : url;
}

/** Splits a comma separated list into escaped badge spans. */
function badges(list: string): string {
    const items = list
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return (
        `<div class="${CLASSES.badges}">` +
        items.map((item) => `<span class="${CLASSES.badge}">${escapeHtml(item)}</span>`).join('') +
        '</div>'
    );
}

/** Replaces MDX-lite tags with line-level sentinels pointing into `stash`. */
function extractTags(source: string, stash: string[]): string {
    const put = (html: string) => {
        stash.push(html);
        return `\n${OPEN}${stash.length - 1}${CLOSE}\n`;
    };
    const stack: { name: string; close: string }[] = [];
    const open = (name: string, html: string, close: string) => {
        stack.push({ name, close });
        return put(html);
    };
    const closeTag = (name: string) => {
        const index = stack.map((entry) => entry.name).lastIndexOf(name);
        if (index === -1) return '\n';
        const closing = stack.splice(index).reverse();
        return put(closing.map((entry) => entry.close).join(''));
    };

    const chevron = `<svg class="${CLASSES.chevron}" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>`;

    const tag =
        /<Badges\s+tags="([^"]*)"\s*\/>|<Badges>([\s\S]*?)<\/Badges>|<Card(?:\s+title="([^"]*)")?\s*>|<Accordion(?:\s+title="([^"]*)")?\s*>|<(Center|Flex)>|<\/(Card|Accordion|Center|Flex)>/g;

    let out = source.replace(tag, (match, badgeAttr, badgeBody, cardTitle, accTitle, simple, closing) => {
        if (badgeAttr !== undefined) return put(badges(badgeAttr));
        if (badgeBody !== undefined) return put(badges(badgeBody));
        if (closing) return closeTag(closing);
        if (simple === 'Center') return open('Center', `<div class="${CLASSES.center}">`, '</div>');
        if (simple === 'Flex') return open('Flex', `<div class="${CLASSES.flex}">`, '</div>');
        if (accTitle !== undefined || match.startsWith('<Accordion')) {
            return open(
                'Accordion',
                `<details class="${CLASSES.details}"><summary class="${CLASSES.summary}"><span>${escapeHtml(accTitle ?? '')}</span>${chevron}</summary><div class="${CLASSES.detailsBody}">`,
                '</div></details>',
            );
        }
        const title = cardTitle ? `<h3 class="${CLASSES.cardTitle}">${escapeHtml(cardTitle)}</h3>` : '';
        return open('Card', `<div class="${CLASSES.card}">${title}<div class="${CLASSES.cardBody}">`, '</div></div>');
    });

    // Close anything left open so the surrounding layout stays intact.
    if (stack.length > 0) {
        stash.push(
            stack
                .reverse()
                .map((entry) => entry.close)
                .join(''),
        );
        out += `\n${OPEN}${stash.length - 1}${CLOSE}`;
    }
    return out;
}

function emphasis(text: string): string {
    return text
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, `<strong class="${CLASSES.strong}">$1</strong>`)
        .replace(/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g, `<em class="${CLASSES.em}">$1</em>`);
}

/** Inline formatting on already-escaped text. Generated markup is stashed to protect it from later passes. */
function inline(text: string, stash: string[]): string {
    const keep = (html: string) => {
        stash.push(html);
        return `${OPEN}${stash.length - 1}${CLOSE}`;
    };

    let out = text.replace(/`([^`]+)`/g, (_m, code) => keep(`<code class="${CLASSES.code}">${code}</code>`));

    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) =>
        keep(`<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" decoding="async" class="${CLASSES.img}">`),
    );

    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
        const external = /^https?:\/\//i.test(href);
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        return keep(`<a href="${safeUrl(href)}" class="${CLASSES.a}"${attrs}>${emphasis(label)}</a>`);
    });

    return emphasis(out);
}

function restore(html: string, stash: string[]): string {
    let out = html;
    // Stashed entries may themselves contain sentinels (link text with code spans).
    for (let guard = 0; guard < 5 && out.includes(OPEN); guard++) {
        out = out.replace(SENTINEL_ANY, (_m, index) => stash[Number(index)] ?? '');
    }
    return out;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(markdown: string | null | undefined): string {
    if (!markdown) return '';

    const stash: string[] = [];
    const source = markdown
        .replace(/\r\n?/g, '\n')
        .replaceAll(OPEN, '')
        .replaceAll(CLOSE, '')
        .replace(/^import\s+.*\s+from\s+['"].*['"];?\s*$/gm, '');

    // Tags first (before escaping), then escape everything else.
    const withCode = source.replace(/^[ \t]*```[^\n]*\n([\s\S]*?)\n?[ \t]*```[ \t]*$/gm, (_match, code) => {
        stash.push(`<pre class="${CLASSES.pre}"><code>${escapeHtml(code)}</code></pre>`);
        return `\n${OPEN}${stash.length - 1}${CLOSE}\n`;
    });
    const lines = extractTags(withCode, stash).split('\n');

    const html: string[] = [];
    let paragraph: string[] = [];

    const flushParagraph = () => {
        if (paragraph.length === 0) return;
        html.push(`<p class="${CLASSES.p}">${inline(escapeHtml(paragraph.join('\n')), stash)}</p>`);
        paragraph = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') {
            flushParagraph();
            continue;
        }

        const sentinel = SENTINEL_LINE.exec(trimmed);
        if (sentinel) {
            flushParagraph();
            html.push(stash[Number(sentinel[1])]);
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            flushParagraph();
            const level = Math.min(heading[1].length + 1, 6);
            html.push(
                `<h${level} class="${CLASSES.heading[level]}">${inline(escapeHtml(heading[2]), stash)}</h${level}>`,
            );
            continue;
        }

        if (QUOTE.test(line)) {
            flushParagraph();
            const quote: string[] = [];
            for (; i < lines.length && QUOTE.test(lines[i]); i++) quote.push(QUOTE.exec(lines[i])![1]);
            i--;
            html.push(
                `<blockquote class="${CLASSES.blockquote}">${inline(escapeHtml(quote.join('\n')), stash)}</blockquote>`,
            );
            continue;
        }

        const ordered = !UL_ITEM.test(line) && OL_ITEM.test(line);
        if (ordered || UL_ITEM.test(line)) {
            flushParagraph();
            const item = ordered ? OL_ITEM : UL_ITEM;
            const items: string[] = [];
            for (; i < lines.length && item.test(lines[i]); i++) {
                items.push(`<li class="${CLASSES.li}">${inline(escapeHtml(item.exec(lines[i])![1]), stash)}</li>`);
            }
            i--;
            const tagName = ordered ? 'ol' : 'ul';
            html.push(`<${tagName} class="${CLASSES[tagName]}">${items.join('')}</${tagName}>`);
            continue;
        }

        paragraph.push(line.trim());
    }
    flushParagraph();

    return restore(html.join('\n'), stash);
}

/** Plain-text rendition (markup stripped, whitespace collapsed) of Markdown / MDX-lite or a block document, for excerpts and meta descriptions. */
export function toPlainText(content: string | null | undefined): string {
    if (!content) return '';
    // A truncated block document must never leak its JSON into an excerpt.
    const blockDocument = isBlockDocument(content) || content.trimStart().startsWith('{"type":"sic-blocks"');
    return blockDocument ? blocksToPlainText(content) : stripMarkdown(content);
}
