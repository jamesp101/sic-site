/**
 * Rich content: the one place that decides whether a stored value is a Block document or Legacy Markdown
 * (posts, hero sections, `welcome_hero_content`) and what comes out of it.
 *
 * Rule: content that opens with `{"type":"sic-blocks"` (leading whitespace ignored) is a Block document.
 * If it does not parse or validate it renders `''`, has an empty Excerpt and fails `check` - its JSON never
 * reaches a page. Anything else is Markdown / MDX-lite, whose headings already sit below the page's single
 * h1 (Markdown `#` renders as h2, block headings are h2-h4), so no further shifting happens here.
 *
 * `parseContent` classifies and parses once; `html`, `text`, `excerpt` and `check` share that work.
 */
import { parseMarkdown } from '../markdown';
import { stripMarkdown } from '../markdown-strip';
import { isBlockDocument } from './document';
import { documentToPlainText } from './plain-text';
import { renderDocument } from './render';
import { parseBlockJson } from './schema';

/** Longest Excerpt (characters, ellipsis included). */
export const EXCERPT_LENGTH = 200;

export type ContentCheck = { ok: true; value: string } | { ok: false; message: string };

export interface RichContent {
    readonly format: 'empty' | 'blocks' | 'markdown';
    /** Public HTML. */
    html(): string;
    /** Plain text with markup stripped and whitespace collapsed. */
    text(): string;
    /** Plain text cut to `EXCERPT_LENGTH`. */
    excerpt(): string;
    /**
     * Save-time gate: block documents are validated and re-serialised in normalised form (empty ones
     * become `''`), Markdown passes through untouched.
     */
    check(): ContentCheck;
}

const once = <T>(compute: () => T): (() => T) => {
    let done = false;
    let value: T;
    return () => {
        if (!done) {
            value = compute();
            done = true;
        }
        return value;
    };
};

export function clampExcerpt(text: string): string {
    return text.length <= EXCERPT_LENGTH ? text : `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}

export function parseContent(content: string | null | undefined): RichContent {
    const source = content ?? '';
    const format = !source ? 'empty' : isBlockDocument(source) ? 'blocks' : 'markdown';
    const excerpt = (text: () => string) => once(() => clampExcerpt(text()));

    if (format === 'blocks') {
        const parsed = once(() => parseBlockJson(source));
        const text = once(() => documentToPlainText(parsed().raw));
        return {
            format,
            html: once(() => {
                const { result } = parsed();
                return result.ok ? renderDocument(result.document) : '';
            }),
            text,
            excerpt: excerpt(text),
            check: once((): ContentCheck => {
                const { result } = parsed();
                if (!result.ok) return { ok: false, message: result.issues[0]?.message ?? 'Invalid content.' };
                if (result.document.blocks.length === 0) return { ok: true, value: '' };
                return { ok: true, value: JSON.stringify(result.document) };
            }),
        };
    }

    const text = once(() => (format === 'empty' ? '' : stripMarkdown(source)));
    return {
        format,
        html: once(() => (format === 'empty' ? '' : parseMarkdown(source))),
        text,
        excerpt: excerpt(text),
        check: () => ({ ok: true, value: source }),
    };
}

/** Stored content → HTML for public pages. */
export const renderContent = (content: string | null | undefined): string => parseContent(content).html();

/** Stored content → plain text (markup stripped, whitespace collapsed) for meta descriptions and feeds. */
export const toPlainText = (content: string | null | undefined): string => parseContent(content).text();

/** Stored content → Excerpt of at most `EXCERPT_LENGTH` characters. */
export const excerptOf = (content: string | null | undefined): string => parseContent(content).excerpt();

/** Save-time gate for a content column (see `RichContent.check`). */
export const checkContent = (content: string): ContentCheck => parseContent(content).check();
