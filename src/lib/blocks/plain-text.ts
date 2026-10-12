/** Plain-text extraction from a stored block document (excerpts, meta descriptions, feeds). Tolerates malformed JSON. */
import { stripMarkdown } from '../markdown-strip';
import { formatEventDay, formatEventTime, parseEventDate } from './event-date';
import { inlineToText } from './inline';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const items = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const rich = (value: unknown): string => inlineToText(text(value));

function collect(blocks: unknown[], out: string[]): void {
    for (const raw of blocks) {
        if (!isObject(raw)) continue;
        const props = isObject(raw.props) ? raw.props : {};
        switch (raw.type) {
            case 'heading':
                out.push(text(props.text));
                break;
            case 'paragraph':
                out.push(rich(props.text));
                break;
            case 'list':
                for (const item of items(props.items)) out.push(rich(item));
                break;
            case 'quote':
                out.push(rich(props.text));
                break;
            case 'badges':
                out.push(items(props.items).map(text).join(', '));
                break;
            case 'card':
                out.push(text(props.title), rich(props.body));
                break;
            case 'table':
                for (const row of items(props.rows)) out.push(items(row).map(rich).join(' '));
                break;
            case 'accordion':
                for (const item of items(props.items)) {
                    if (isObject(item)) out.push(text(item.title), rich(item.body));
                }
                break;
            case 'callout':
                out.push(text(props.title), rich(props.text));
                break;
            case 'stats':
                for (const item of items(props.items)) {
                    if (isObject(item)) out.push(`${text(item.value)} ${text(item.label)}`);
                }
                break;
            case 'event': {
                const start = parseEventDate(props.start);
                out.push(
                    text(props.title),
                    start ? `${formatEventDay(start)} ${formatEventTime(start)}` : '',
                    text(props.location),
                    rich(props.note),
                );
                break;
            }
            case 'markdown':
                out.push(stripMarkdown(text(props.source)));
                break;
            default:
                break;
        }
        collect(items(raw.children), out);
    }
}

/** Joins every readable text of the document with single spaces. */
export function blocksToPlainText(content: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return '';
    }
    if (!isObject(parsed)) return '';
    const parts: string[] = [];
    collect(items(parsed.blocks), parts);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
