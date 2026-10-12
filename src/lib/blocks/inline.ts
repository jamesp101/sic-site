/**
 * Inline markup used by text blocks: `**bold**`, `*italic*`, `[label](url)`, `\` escapes a
 * following character. Everything is emitted escaped; links pass through `safeHref`.
 */
import { escapeHtml } from '../escape-html';
import { isExternalHref, safeHref } from './urls';

const SPECIAL = /[\\*[\]()]/g;

/** Escapes text so it survives a round trip through `inlineToHtml` as literal characters. */
export function escapeInline(text: string): string {
    return text.replace(SPECIAL, (ch) => `\\${ch}`);
}

interface Visitor {
    text(value: string): string;
    strong(inner: string): string;
    em(inner: string): string;
    link(inner: string, href: string | null): string;
    newline: string;
}

function findClose(text: string, from: number, token: string): number {
    for (let i = from; i < text.length; i++) {
        if (text[i] === '\\') {
            i++;
            continue;
        }
        if (text.startsWith(token, i)) {
            // `*` must not be the first half of `**`.
            if (token === '*' && text[i + 1] === '*') {
                i++;
                continue;
            }
            return i;
        }
    }
    return -1;
}

function scan(text: string, visitor: Visitor, depth: number): string {
    let out = '';
    let literal = '';
    const flush = () => {
        if (literal) out += visitor.text(literal);
        literal = '';
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '\\' && i + 1 < text.length) {
            literal += text[++i];
        } else if (ch === '\n') {
            flush();
            out += visitor.newline;
        } else if (depth < 4 && ch === '*' && text[i + 1] === '*') {
            const end = findClose(text, i + 2, '**');
            if (end > i + 2) {
                flush();
                out += visitor.strong(scan(text.slice(i + 2, end), visitor, depth + 1));
                i = end + 1;
            } else {
                literal += '**';
                i++;
            }
        } else if (depth < 4 && ch === '*') {
            const end = findClose(text, i + 1, '*');
            if (end > i + 1) {
                flush();
                out += visitor.em(scan(text.slice(i + 1, end), visitor, depth + 1));
                i = end;
            } else literal += ch;
        } else if (depth < 4 && ch === '[') {
            const mid = findClose(text, i + 1, '](');
            const end = mid === -1 ? -1 : findClose(text, mid + 2, ')');
            if (mid > i + 1 && end > mid + 2) {
                flush();
                out += visitor.link(
                    scan(text.slice(i + 1, mid), visitor, depth + 1),
                    safeHref(text.slice(mid + 2, end).replace(/\\(.)/g, '$1')),
                );
                i = end;
            } else literal += ch;
        } else {
            literal += ch;
        }
    }
    flush();
    return out;
}

const HTML: Visitor = {
    text: escapeHtml,
    strong: (inner) => `<strong class="font-bold text-primary">${inner}</strong>`,
    em: (inner) => `<em class="italic">${inner}</em>`,
    link: (inner, href) =>
        href === null
            ? inner
            : `<a href="${escapeHtml(href)}" class="font-medium text-link underline underline-offset-2 hover:no-underline"${isExternalHref(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`,
    newline: '<br>',
};

const TEXT: Visitor = {
    text: (value) => value,
    strong: (inner) => inner,
    em: (inner) => inner,
    link: (inner) => inner,
    newline: ' ',
};

/** Inline markup to escaped HTML (newlines become `<br>`). */
export function inlineToHtml(text: string): string {
    return scan(text, HTML, 0);
}

/** Inline markup to plain text. */
export function inlineToText(text: string): string {
    return scan(text, TEXT, 0);
}

/** Splits on blank lines and renders each paragraph with `render`. */
export function paragraphsOf(text: string): string[] {
    return text
        .replace(/\r\n?/g, '\n')
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
}
