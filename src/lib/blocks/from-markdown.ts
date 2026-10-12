/**
 * Legacy Markdown / MDX-lite → block document. Understands exactly the syntax `../markdown` renders
 * (headings, paragraphs, lists, quotes, fenced code, `<Card>`, `<Center>`, `<Flex>`, `<Accordion>`,
 * `<Badges>`, `import` lines). Anything that has no block equivalent (fenced code, content that exceeds a
 * limit) is kept verbatim in a `markdown` block, so nothing is lost. Pure TypeScript, no DOM.
 */
import { countBlocks, createBlock, createDocument } from './document';
import { escapeInline } from './inline';
import { validateDocument } from './schema';
import { LIMITS, type Block } from './types';
import { safeImageSrc } from './urls';

const OPEN = '\uE000';
const CLOSE = '\uE001';
const CODE_LINE = /^\uE000(\d+)\uE001$/;
const IMPORT_LINE = /^import\s+.*\s+from\s+['"].*['"];?\s*$/gm;
const FENCE = /^[ \t]*```[^\n]*\n([\s\S]*?)\n?[ \t]*```[ \t]*$/gm;

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/** Same tag grammar as the legacy renderer. */
const TAG =
    /<Badges\s+tags="([^"]*)"\s*\/>|<Badges>([\s\S]*?)<\/Badges>|<Card(?:\s+title="([^"]*)")?\s*>|<Accordion(?:\s+title="([^"]*)")?\s*>|<(Center|Flex)>|<\/(Card|Accordion|Center|Flex)>/g;

/** Tags nested deeper than this are flattened (keeps recursion bounded for hostile input). */
const MAX_TAG_DEPTH = 16;

type TagName = 'root' | 'Card' | 'Accordion' | 'Center' | 'Flex';
interface TagNode {
    name: TagName;
    title: string;
    items: Item[];
}
type Item = string | TagNode | { badges: string };

interface Ctx {
    /** Inside `<Center>`: text is centred. */
    center: boolean;
    /** Original fragments of fenced code, referenced by sentinel lines. */
    codes: string[];
}

// ---------------------------------------------------------------------------------------------
// Tag tree
// ---------------------------------------------------------------------------------------------

function parseTree(source: string): TagNode {
    const root: TagNode = { name: 'root', title: '', items: [] };
    const stack: TagNode[] = [root];
    const top = () => stack[stack.length - 1];
    const open = (name: TagName, title: string) => {
        // Pathological nesting is flattened into the innermost tag that is still tracked.
        if (stack.length > MAX_TAG_DEPTH) return;
        const node: TagNode = { name, title, items: [] };
        top().items.push(node);
        stack.push(node);
    };

    let last = 0;
    for (const match of source.matchAll(TAG)) {
        const index = match.index ?? 0;
        if (index > last) top().items.push(source.slice(last, index));
        last = index + match[0].length;
        const [full, badgeAttr, badgeBody, cardTitle, accTitle, simple, closing] = match;

        if (badgeAttr !== undefined) top().items.push({ badges: badgeAttr });
        else if (badgeBody !== undefined) top().items.push({ badges: badgeBody });
        else if (closing) {
            // Closes the nearest matching tag (and anything opened inside it); stray closers are ignored.
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].name === closing) {
                    stack.length = i;
                    break;
                }
            }
        } else if (simple === 'Center' || simple === 'Flex') open(simple, '');
        else if (accTitle !== undefined || full.startsWith('<Accordion')) open('Accordion', accTitle ?? '');
        else open('Card', cardTitle ?? '');
    }
    if (last < source.length) top().items.push(source.slice(last));
    return root;
}

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

const escapeBackslash = (text: string) => text.replace(/\\/g, '\\\\');

/** Legacy inline text → block inline markup: backticks are dropped, code content stays literal. */
function inlineMarkup(raw: string): string {
    let out = '';
    let last = 0;
    for (const match of raw.matchAll(/`([^`]+)`/g)) {
        const index = match.index ?? 0;
        out += escapeBackslash(raw.slice(last, index)) + escapeInline(match[1]);
        last = index + match[0].length;
    }
    return out + escapeBackslash(raw.slice(last));
}

/** Legacy inline text → plain text (headings and card/accordion titles are not inline-rendered). */
function plainText(raw: string): string {
    return raw
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
        .replace(/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g, '$1')
        .trim();
}

/** Splits at line breaks or spaces so every part stays within `max` characters. */
function splitText(text: string, max: number): string[] {
    const parts: string[] = [];
    let rest = text.trim();
    while (rest.length > max) {
        let cut = rest.lastIndexOf('\n', max);
        if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        parts.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts.filter(Boolean);
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// ---------------------------------------------------------------------------------------------
// Block factories
// ---------------------------------------------------------------------------------------------

function markdownBlock(source: string): Block[] {
    return source.trim() ? [createBlock('markdown', { source: source.slice(0, LIMITS.markdown) })] : [];
}

function paragraphBlocks(raw: string, ctx: Ctx): Block[] {
    return splitText(inlineMarkup(raw), LIMITS.text).map((text) =>
        createBlock('paragraph', ctx.center ? { text, align: 'center' } : { text }),
    );
}

function headingBlocks(hashes: number, raw: string, ctx: Ctx, line: string): Block[] {
    const text = plainText(raw);
    if (!text) return [];
    if (text.length > LIMITS.label) return markdownBlock(line.trim());
    const level = hashes === 1 ? 2 : hashes === 2 ? 3 : 4;
    return [createBlock('heading', ctx.center ? { text, level, align: 'center' } : { text, level })];
}

function quoteBlocks(lines: string[]): Block[] {
    const text = inlineMarkup(lines.join('\n')).trim();
    return splitText(text, LIMITS.text).map((part) => createBlock('quote', { text: part }));
}

function listBlocks(ordered: boolean, lines: string[], rawItems: string[]): Block[] {
    const items = rawItems.map((item) => inlineMarkup(item).trim()).filter(Boolean);
    if (items.length === 0) return [];
    // An item that does not fit a list entry is kept verbatim instead of being cut.
    if (items.some((item) => item.length > LIMITS.label)) return markdownBlock(lines.join('\n'));
    return chunks(items, LIMITS.listItems).map((part) => createBlock('list', { ordered, items: part }));
}

function imageBlock(alt: string, src: string): Block | null {
    const safe = safeImageSrc(src);
    if (!safe || safe.length > LIMITS.url) return null;
    const text = plainText(alt).slice(0, LIMITS.label);
    return createBlock('image', text ? { src: safe, alt: text } : { src: safe, decorative: true });
}

function badgeBlocks(raw: string): Block[] {
    const items = raw
        .split(',')
        .map((item) => plainText(item).slice(0, 80))
        .filter(Boolean);
    return chunks(items, LIMITS.badgeItems).map((part) => createBlock('badges', { items: part }));
}

// ---------------------------------------------------------------------------------------------
// Text segments (everything between tags)
// ---------------------------------------------------------------------------------------------

function parseText(text: string, ctx: Ctx): Block[] {
    const out: Block[] = [];
    const lines = text.split('\n');
    let paragraph: string[] = [];

    const flush = () => {
        if (paragraph.length > 0) out.push(...paragraphBlocks(paragraph.join('\n'), ctx));
        paragraph = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') {
            flush();
            continue;
        }

        const code = CODE_LINE.exec(trimmed);
        if (code) {
            flush();
            out.push(...markdownBlock(ctx.codes[Number(code[1])] ?? ''));
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            flush();
            out.push(...headingBlocks(heading[1].length, heading[2], ctx, line));
            continue;
        }

        if (QUOTE.test(line)) {
            flush();
            const quote: string[] = [];
            for (; i < lines.length && QUOTE.test(lines[i]); i++) quote.push(QUOTE.exec(lines[i])![1]);
            i--;
            out.push(...quoteBlocks(quote));
            continue;
        }

        const ordered = !UL_ITEM.test(line) && OL_ITEM.test(line);
        if (ordered || UL_ITEM.test(line)) {
            flush();
            const item = ordered ? OL_ITEM : UL_ITEM;
            const start = i;
            const items: string[] = [];
            for (; i < lines.length && item.test(lines[i]); i++) items.push(item.exec(lines[i])![1]);
            out.push(...listBlocks(ordered, lines.slice(start, i), items));
            i--;
            continue;
        }

        const image = IMAGE_LINE.exec(trimmed);
        const block = image ? imageBlock(image[1], image[2]) : null;
        if (block) {
            flush();
            out.push(block);
            continue;
        }

        paragraph.push(trimmed);
    }
    flush();
    return out;
}

// ---------------------------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------------------------

/** Readable text of already converted blocks, used where the target block only holds plain text. */
function toBodyText(blocks: Block[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'paragraph':
            case 'heading':
            case 'quote':
                parts.push(block.props.text);
                break;
            case 'list':
                parts.push(
                    block.props.items
                        .map((item, index) => (block.props.ordered ? `${index + 1}. ${item}` : `- ${item}`))
                        .join('\n'),
                );
                break;
            case 'badges':
                parts.push(block.props.items.join(', '));
                break;
            case 'image':
                if (block.props.alt) parts.push(block.props.alt);
                break;
            case 'markdown':
                parts.push(block.props.source);
                break;
            default:
                if (block.children) parts.push(toBodyText(block.children));
                break;
        }
    }
    return parts.filter(Boolean).join('\n\n');
}

function convertNode(node: TagNode, ctx: Ctx, depth: number): Block[] {
    // Containers that would exceed the nesting limit are dissolved into their parent.
    const room = depth < LIMITS.depth;

    switch (node.name) {
        case 'Center':
        case 'Flex': {
            const childCtx = node.name === 'Center' ? { ...ctx, center: true } : ctx;
            if (!room) return convertItems(node.items, childCtx, depth);
            const children = convertItems(node.items, childCtx, depth + 1);
            if (children.length === 0) return [];
            const row =
                node.name === 'Center'
                    ? createBlock('row', { direction: 'column', align: 'center', gap: 'sm' })
                    : createBlock('row', { direction: 'responsive' });
            row.children = children;
            return [row];
        }

        case 'Accordion': {
            const body = toBodyText(convertItems(node.items, { ...ctx, center: false }, LIMITS.depth));
            const title = plainText(node.title).slice(0, LIMITS.label);
            if (!title && !body) return [];
            const [first = '', ...rest] = splitText(body, LIMITS.text);
            const accordion = createBlock('accordion', { items: [{ title: title || 'Details', body: first }] });
            return [accordion, ...rest.map((text) => createBlock('paragraph', { text }))];
        }

        case 'Card': {
            const title = plainText(node.title).slice(0, LIMITS.label);
            if (!room) {
                const heading = title ? [createBlock('heading', { text: title, level: 4 })] : [];
                return [...heading, ...convertItems(node.items, ctx, depth)];
            }
            const content = convertItems(node.items, ctx, depth + 1);
            const paragraphs: string[] = [];
            const children: Block[] = [];
            let length = 0;
            for (const block of content) {
                if (block.type === 'paragraph' && length + block.props.text.length <= LIMITS.text) {
                    paragraphs.push(block.props.text);
                    length += block.props.text.length + 2;
                } else children.push(block);
            }
            if (!title && paragraphs.length === 0 && children.length === 0) return [];
            const card = createBlock('card', { title, body: paragraphs.join('\n\n') });
            card.children = children;
            return [card];
        }

        default:
            return convertItems(node.items, ctx, depth);
    }
}

function convertItems(items: Item[], ctx: Ctx, depth: number): Block[] {
    const out: Block[] = [];
    for (const item of items) {
        if (typeof item === 'string') out.push(...parseText(item, ctx));
        else if ('badges' in item) out.push(...badgeBlocks(item.badges));
        else out.push(...convertNode(item, ctx, depth));
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/** The whole source as `markdown` blocks (used when a document cannot be expressed within the limits). */
function fallback(source: string): Block[] {
    return splitText(source, LIMITS.markdown).flatMap((part) => markdownBlock(part));
}

/** Converts legacy Markdown / MDX-lite into blocks that pass `validateDocument`. Empty input gives `[]`. */
export function markdownToBlocks(source: string): Block[] {
    if (!source || !source.trim()) return [];

    const codes: string[] = [];
    const prepared = source
        .replace(/\r\n?/g, '\n')
        .replaceAll(OPEN, '')
        .replaceAll(CLOSE, '')
        .replace(IMPORT_LINE, '')
        .replace(FENCE, (match) => {
            codes.push(match);
            return `\n${OPEN}${codes.length - 1}${CLOSE}\n`;
        });

    const blocks = convertItems(parseTree(prepared).items, { center: false, codes }, 1);
    if (blocks.length === 0) return [];

    const document = createDocument(blocks);
    const fits = countBlocks(blocks) <= LIMITS.blocks && JSON.stringify(document).length <= LIMITS.documentChars;
    if (fits && validateDocument(document).ok) return blocks;
    return fallback(source.replace(/\r\n?/g, '\n'));
}
