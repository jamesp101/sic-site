/** Plain-text extraction from a stored block document (excerpts, meta descriptions, feeds). Tolerates malformed JSON. */
import { blockModule, isBlockType } from './registry';
import { isObject, itemsOf } from './text-kit';

function collect(blocks: unknown[], out: string[]): void {
    for (const raw of blocks) {
        if (!isObject(raw)) continue;
        // Each Block type reads its own props; a type the registry does not know contributes nothing.
        if (isBlockType(raw.type)) out.push(...blockModule(raw.type).text(isObject(raw.props) ? raw.props : {}));
        collect(itemsOf(raw.children), out);
    }
}

/** Joins every readable text of an already parsed document with single spaces; `''` when it is not an object. */
export function documentToPlainText(parsed: unknown): string {
    if (!isObject(parsed)) return '';
    const parts: string[] = [];
    collect(itemsOf(parsed.blocks), parts);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Joins every readable text of a stored document string; `''` when it does not parse. */
export function blocksToPlainText(content: string): string {
    try {
        return documentToPlainText(JSON.parse(content));
    } catch {
        return '';
    }
}
