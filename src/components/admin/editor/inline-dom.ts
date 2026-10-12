/** Converts the DOM of an inline-edited text element back into the block inline markup (`**b**`, `*i*`, `[x](url)`). */
import { escapeInline } from '@/lib/blocks/inline';
import { safeHref } from '@/lib/blocks/urls';

const BLOCK_TAGS: Record<string, true> = { DIV: true, P: true, LI: true };

function wrap(token: string, inner: string): string {
    const trimmed = inner.trim();
    if (!trimmed) return inner;
    const lead = inner.slice(0, inner.length - inner.trimStart().length);
    const trail = inner.slice(inner.trimEnd().length);
    return `${lead}${token}${trimmed}${token}${trail}`;
}

function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeInline((node.nodeValue ?? '').replace(/\u00a0/g, ' '));
    if (!(node instanceof HTMLElement)) return '';
    if (node.tagName === 'BR') return '\n';

    const inner = Array.from(node.childNodes).map(walk).join('');
    const weight = node.style.fontWeight;
    const bold =
        node.tagName === 'B' || node.tagName === 'STRONG' || weight === 'bold' || Number.parseInt(weight, 10) >= 600;
    const italic = node.tagName === 'I' || node.tagName === 'EM' || node.style.fontStyle === 'italic';

    let out = inner;
    if (node.tagName === 'A') {
        const href = safeHref(node.getAttribute('href'));
        if (href) out = `[${inner}](${href.replace(/[\\()]/g, (ch) => `\\${ch}`)})`;
    }
    if (bold) out = wrap('**', out);
    if (italic) out = wrap('*', out);
    return BLOCK_TAGS[node.tagName] === true && out ? `\n${out}` : out;
}

/** Rich text: bold, italic, links and line breaks survive. */
export function domToInline(element: HTMLElement): string {
    return Array.from(element.childNodes).map(walk).join('').replace(/^\n+/, '').replace(/\n+$/, '');
}

/** Plain text: line breaks collapse to spaces. */
export function domToPlain(element: HTMLElement): string {
    return (element.textContent ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
}
