import { parseMarkdown } from '@/lib/markdown';

/**
 * Markdown → HTML for public pages. Editors write `# Heading`, but every page already
 * owns its single h1, so content headings shift down one level (h1→h2 … h5→h6).
 */
export function renderContent(markdown: string | null | undefined): string {
    return parseMarkdown(markdown).replace(
        /<(\/?)h([1-5])\b/g,
        (_, slash: string, level: string) => `<${slash}h${Number(level) + 1}`,
    );
}
