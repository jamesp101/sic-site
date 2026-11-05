/**
 * Server-side (and editor-side) validation of block documents with zod. Whitelisted block types
 * and props, size limits, safe URLs. `validateDocument` returns a normalised document: unknown
 * props are dropped and defaults are filled, so only sanitised JSON is ever stored.
 */
import { z } from 'zod';
import { BLOCK_REGISTRY, BLOCK_TYPES, blockModule, isContainerType } from './registry';
import { DOCUMENT_TYPE, DOCUMENT_VERSION, LIMITS } from './types';
import type { Block, BlockDocument, BlockType, PropsByType } from './types';

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
    return `${BLOCK_REGISTRY[type].meta.label} ${index}`;
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
            const kind = blockModule(type);
            const name = describe(type, ++ordinal);
            const fail = (message: string, blockId = id) => issues.push({ blockId, message: `${name}: ${message}` });

            if (++total > LIMITS.blocks) {
                if (total === LIMITS.blocks + 1) issues.push({ message: `Use at most ${LIMITS.blocks} elements.` });
                continue;
            }
            if (seen[id]) fail('Duplicate element id.');
            seen[id] = true;
            if (depth > LIMITS.depth) fail(`Elements can be nested at most ${LIMITS.depth} levels deep.`);
            if (kind.rootOnly && !rootLevel) fail('Sections can only be placed at the top level.');

            const result = kind.schema.safeParse(props);
            if (!result.success) {
                for (const issue of result.error.issues) {
                    const field = issue.path.length ? `${issue.path.join(' › ')}: ` : '';
                    fail(`${field}${issue.message}`);
                }
                continue;
            }
            // `result.data` is the zod output for exactly this block type.
            const parsedProps = result.data as never;
            kind.rules?.(parsedProps, (message) => fail(message));

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

/** A stored JSON string, parsed once: the raw value (when it parses and fits) plus its validation. */
export function parseBlockJson(json: string): { raw: unknown; result: ValidationResult } {
    if (json.length > LIMITS.documentChars) {
        return {
            raw: undefined,
            result: { ok: false, issues: [{ message: 'This content is too large. Remove some elements.' }] },
        };
    }
    try {
        const raw: unknown = JSON.parse(json);
        return { raw, result: validateDocument(raw) };
    } catch {
        return { raw: undefined, result: { ok: false, issues: [{ message: 'This content is not valid JSON.' }] } };
    }
}

/** Parses a stored JSON string and validates it. */
export function parseBlockDocument(json: string): ValidationResult {
    return parseBlockJson(json).result;
}

/**
 * Problems with one block's props as a map from the prop (first path segment) to its first message: the
 * shape errors of the Block type's schema, then its cross-field rules. The Inspector shows these inline,
 * so editors see the same wording and rules as the save-time validation.
 */
export function blockFieldErrors<T extends BlockType>(type: T, props: PropsByType[T]): Record<string, string> {
    const kind = blockModule(type);
    const errors: Record<string, string> = {};
    const add = (message: string, path: (string | number)[] = []) => {
        const field = String(path[0] ?? '');
        if (!(field in errors)) errors[field] = message;
    };
    const result = kind.schema.safeParse(props);
    if (!result.success) {
        for (const issue of result.error.issues) add(issue.message, issue.path as (string | number)[]);
        return errors;
    }
    kind.rules?.(result.data as never, add);
    return errors;
}
