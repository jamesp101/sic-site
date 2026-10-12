import { parseMarkdown } from '../markdown';
import { isBlockDocument } from './document';
import { renderDocument } from './render';
import { parseBlockDocument } from './schema';

/**
 * Stored content → HTML for public pages. Block documents go through the block renderer; anything else is
 * legacy Markdown / MDX-lite. Both formats already keep content headings below the page's single h1
 * (Markdown `#` renders as h2, block headings are h2–h4), so no further shifting happens here.
 */
export function renderContent(content: string | null | undefined): string {
    if (!content) return '';
    if (!isBlockDocument(content)) return parseMarkdown(content);
    const result = parseBlockDocument(content);
    return result.ok ? renderDocument(result.document) : '';
}
