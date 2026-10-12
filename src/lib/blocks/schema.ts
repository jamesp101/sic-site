/**
 * Server-side (and editor-side) validation of block documents with zod. Whitelisted block types
 * and props, size limits, safe URLs. `validateDocument` returns a normalised document: unknown
 * props are dropped and defaults are filled, so only sanitised JSON is ever stored.
 */
import { z } from 'zod';
import { eventDateKey, parseEventDate } from './event-date';
import { DOCUMENT_TYPE, DOCUMENT_VERSION, BLOCK_META, BLOCK_TYPES, LIMITS, isContainerType } from './types';
import type { Block, BlockDocument, BlockType, PropsByType } from './types';
import { isBlockDocument } from './document';
import { parseVideoUrl, safeHref, safeImageSrc } from './urls';

const str = (max: number) => z.string().max(max, `Keep this under ${max} characters.`).default('');
const label = str(LIMITS.label);
const body = str(LIMITS.text);
const url = str(LIMITS.url);
const gap = z.enum(['none', 'sm', 'md', 'lg']).default('md');
const textAlign = z.enum(['inherit', 'left', 'center', 'right']).default('inherit');
const list = (max: number, item: z.ZodType<string> = z.string().max(LIMITS.cell)) => z.array(item).max(max).default([]);

const PROPS = {
    section: z.object({
        background: z.enum(['none', 'surface', 'alt', 'accent', 'gold']).default('alt'),
        padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
        align: textAlign,
    }),
    row: z.object({
        direction: z.enum(['row', 'column', 'responsive']).default('responsive'),
        gap,
        align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
        justify: z.enum(['start', 'center', 'end', 'between']).default('start'),
        wrap: z.boolean().default(false),
    }),
    grid: z.object({ columns: z.number().int().min(1).max(6).default(3), gap }),
    columns: z.object({
        count: z.union([z.literal(2), z.literal(3)]).default(2),
        ratio: z.enum(['equal', 'wide-left', 'wide-right']).default('equal'),
        gap: gap.default('lg'),
    }),
    spacer: z.object({ size: z.enum(['sm', 'md', 'lg', 'xl']).default('md') }),
    divider: z.object({ tone: z.enum(['default', 'strong', 'gold']).default('default') }),
    heading: z.object({
        text: label,
        level: z
            .union([z.literal(2), z.literal(3), z.literal(4)], { error: 'Headings can be level 2, 3 or 4.' })
            .default(2),
        align: textAlign,
    }),
    paragraph: z.object({
        text: body,
        size: z.enum(['sm', 'base', 'lg']).default('base'),
        tone: z.enum(['default', 'muted']).default('default'),
        align: textAlign,
    }),
    list: z.object({
        ordered: z.boolean().default(false),
        items: list(LIMITS.listItems, z.string().max(LIMITS.label)),
    }),
    quote: z.object({ text: body, cite: label }),
    button: z.object({
        label,
        href: url,
        variant: z.enum(['primary', 'secondary', 'ghost']).default('primary'),
        align: textAlign,
    }),
    badges: z.object({ items: list(LIMITS.badgeItems, z.string().max(80)) }),
    card: z.object({ title: label, body, imageUrl: url, imageAlt: label, linkLabel: label, linkHref: url }),
    image: z.object({
        src: url,
        alt: label,
        decorative: z.boolean().default(false),
        caption: label,
        width: z.number().int().min(1).max(20_000).nullable().default(null),
        height: z.number().int().min(1).max(20_000).nullable().default(null),
    }),
    table: z.object({
        header: z.boolean().default(true),
        caption: label,
        rows: z
            .array(z.array(z.string().max(LIMITS.cell)).min(1).max(LIMITS.tableColumns))
            .max(LIMITS.tableRows)
            .default([]),
    }),
    accordion: z.object({
        items: z
            .array(z.object({ title: label, body }))
            .max(LIMITS.accordionItems)
            .default([]),
    }),
    callout: z.object({ tone: z.enum(['info', 'success', 'warning']).default('info'), title: label, text: body }),
    stats: z.object({
        items: z
            .array(z.object({ value: str(80), label: str(120), hint: str(200) }))
            .max(LIMITS.statItems)
            .default([]),
    }),
    video: z.object({ url, title: label, caption: label }),
    event: z.object({ title: label, start: str(16), end: str(16), location: label, note: body }),
    markdown: z.object({ source: str(LIMITS.markdown) }),
} satisfies Record<BlockType, z.ZodType>;

type Report = (message: string, path?: (string | number)[]) => void;

/** Cross-field rules that need more than a shape check. */
const RULES: { [K in BlockType]?: (props: PropsByType[K], report: Report) => void } = {
    image(props, report) {
        if (!props.src) report('Choose an image.', ['src']);
        else if (!safeImageSrc(props.src)) report('This image address is not allowed.', ['src']);
        if (!props.decorative && !props.alt.trim()) {
            report('Describe the image in the alt text, or mark it as decorative.', ['alt']);
        }
    },
    button(props, report) {
        if (!props.label.trim()) report('Give the button a label.', ['label']);
        if (!safeHref(props.href)) report('Enter a valid link (https://, /path, mailto: or tel:).', ['href']);
    },
    card(props, report) {
        if (props.imageUrl && !safeImageSrc(props.imageUrl)) report('This image address is not allowed.', ['imageUrl']);
        if (props.linkHref && !safeHref(props.linkHref)) report('Enter a valid link.', ['linkHref']);
        if (props.linkHref && !props.linkLabel.trim()) report('Give the card link a label.', ['linkLabel']);
    },
    video(props, report) {
        if (!parseVideoUrl(props.url)) report('Use a YouTube or Vimeo video link.', ['url']);
        if (!props.title.trim()) report('Add a video title for screen readers.', ['title']);
    },
    event(props, report) {
        const start = parseEventDate(props.start);
        if (!start) report('Choose a valid start date.', ['start']);
        if (props.end) {
            const end = parseEventDate(props.end);
            if (!end) report('Choose a valid end date.', ['end']);
            else if (start && eventDateKey(end) < eventDateKey(start))
                report('The end must be after the start.', ['end']);
        }
    },
    table(props, report) {
        if (props.rows.length === 0) report('Add at least one row.', ['rows']);
        const width = props.rows[0]?.length ?? 0;
        if (props.rows.some((row) => row.length !== width))
            report('Every row needs the same number of columns.', ['rows']);
    },
    accordion(props, report) {
        if (props.items.length === 0) report('Add at least one item.', ['items']);
        if (props.items.some((item) => !item.title.trim())) report('Every item needs a title.', ['items']);
    },
};

export interface ValidationIssue {
    /** Block the issue belongs to (absent for document-level issues). */
    blockId?: string;
    message: string;
}

export type ValidationResult = { ok: true; document: BlockDocument } | { ok: false; issues: ValidationIssue[] };

const shell = z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, 'Invalid block id.'),
    type: z.enum(BLOCK_TYPES, { error: 'Unknown block type.' }),
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(z.unknown()).optional(),
});

function describe(type: BlockType, index: number): string {
    return `${BLOCK_META[type].label} ${index}`;
}

/**
 * Validates and normalises an untrusted value. Issues are phrased for editors
 * ("Image 2: Describe the image …") and carry the offending block id.
 */
export function validateDocument(input: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];
    const seen: Record<string, true> = {};
    let total = 0;
    let ordinal = 0;

    const head = z
        .object({ type: z.literal(DOCUMENT_TYPE), version: z.literal(DOCUMENT_VERSION), blocks: z.array(z.unknown()) })
        .safeParse(input);
    if (!head.success) return { ok: false, issues: [{ message: 'This content is not a valid block document.' }] };

    const walk = (raw: unknown[], depth: number, rootLevel: boolean): Block[] => {
        const out: Block[] = [];
        for (const item of raw) {
            const parsed = shell.safeParse(item);
            if (!parsed.success) {
                issues.push({ message: parsed.error.issues[0]?.message ?? 'Invalid block.' });
                continue;
            }
            const { id, type, props, children } = parsed.data;
            const name = describe(type, ++ordinal);
            const fail = (message: string, blockId = id) => issues.push({ blockId, message: `${name}: ${message}` });

            if (++total > LIMITS.blocks) {
                if (total === LIMITS.blocks + 1) issues.push({ message: `Use at most ${LIMITS.blocks} elements.` });
                continue;
            }
            if (seen[id]) fail('Duplicate element id.');
            seen[id] = true;
            if (depth > LIMITS.depth) fail(`Elements can be nested at most ${LIMITS.depth} levels deep.`);
            if (type === 'section' && !rootLevel) fail('Sections can only be placed at the top level.');

            const result = PROPS[type].safeParse(props);
            if (!result.success) {
                for (const issue of result.error.issues) {
                    const field = issue.path.length ? `${issue.path.join(' › ')}: ` : '';
                    fail(`${field}${issue.message}`);
                }
                continue;
            }
            // `result.data` is the zod output for exactly this block type.
            const parsedProps = result.data as never;
            RULES[type]?.(parsedProps, (message) => fail(message));

            const block = { id, type, props: parsedProps } as Block;
            if (children !== undefined) {
                if (!isContainerType(type)) fail('This element cannot contain other elements.');
                else block.children = walk(children, depth + 1, false);
            } else if (isContainerType(type)) block.children = [];
            out.push(block);
        }
        return out;
    };

    const blocks = walk(head.data.blocks, 1, true);
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, document: { type: DOCUMENT_TYPE, version: DOCUMENT_VERSION, blocks } };
}

/** Parses a stored JSON string and validates it. */
export function parseBlockDocument(json: string): ValidationResult {
    if (json.length > LIMITS.documentChars) {
        return { ok: false, issues: [{ message: 'This content is too large. Remove some elements.' }] };
    }
    try {
        return validateDocument(JSON.parse(json));
    } catch {
        return { ok: false, issues: [{ message: 'This content is not valid JSON.' }] };
    }
}

export type ContentCheck = { ok: true; value: string } | { ok: false; message: string };

/**
 * Save-time gate for a content column: block documents are validated and re-serialised in
 * normalised form (empty ones become `''`), anything else is legacy Markdown and passes through.
 */
export function checkContent(content: string): ContentCheck {
    if (!isBlockDocument(content)) return { ok: true, value: content };
    const result = parseBlockDocument(content);
    if (!result.ok) return { ok: false, message: result.issues[0]?.message ?? 'Invalid content.' };
    if (result.document.blocks.length === 0) return { ok: true, value: '' };
    return { ok: true, value: JSON.stringify(result.document) };
}
