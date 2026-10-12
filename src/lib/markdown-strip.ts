/** Plain-text rendition of Markdown / MDX-lite (markup stripped, whitespace collapsed). */
export function stripMarkdown(markdown: string | null | undefined): string {
    if (!markdown) return '';
    return markdown
        .replace(/\r\n?/g, '\n')
        .replace(/^import\s+.*\s+from\s+['"].*['"];?\s*$/gm, ' ')
        .replace(/```[^\n]*\n?/g, ' ')
        .replace(/<Badges\s+tags="([^"]*)"\s*\/>/g, ' $1 ')
        .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
        .replace(/(\*\*|__|\*|`)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
