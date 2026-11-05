/** Document helpers: format detection, block factories and immutable tree operations. No DOM. */
import { BLOCK_REGISTRY, isContainerType } from './registry';
import {
    DOCUMENT_TYPE,
    DOCUMENT_VERSION,
    LIMITS,
    type Block,
    type BlockDocument,
    type BlockType,
    type PropsByType,
} from './types';

let counter = 0;

/** Short unique id, stable inside the stored document (`[A-Za-z0-9_-]`, ≤ 32 chars). */
export function newId(): string {
    counter = (counter + 1) % 1_679_616;
    return `b${counter.toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

const BLOCK_DOCUMENT_CLAIM = new RegExp(`^\\{\\s*"type"\\s*:\\s*"${DOCUMENT_TYPE}"`);

/**
 * Whether stored content claims to be a block document: after trimming leading whitespace it opens
 * with `{"type":"sic-blocks"`. This is a claim, not validation: a truncated or malformed document
 * still counts, so it can never be mistaken for Markdown and leak its JSON. See `blocks/content.ts`.
 */
export function isBlockDocument(content: string | null | undefined): boolean {
    return !!content && BLOCK_DOCUMENT_CLAIM.test(content.trimStart());
}

export function emptyDocument(): BlockDocument {
    return { type: DOCUMENT_TYPE, version: DOCUMENT_VERSION, blocks: [] };
}

export function createDocument(blocks: Block[]): BlockDocument {
    return { type: DOCUMENT_TYPE, version: DOCUMENT_VERSION, blocks };
}

export function serializeDocument(doc: BlockDocument): string {
    return JSON.stringify(doc);
}

export function defaultProps<T extends BlockType>(type: T): PropsByType[T] {
    return BLOCK_REGISTRY[type].defaults() as PropsByType[T];
}

/** The vertical stack that holds one column's content. */
function columnStack(): Block<'row'> {
    return createBlock('row', { direction: 'column', gap: 'sm', align: 'stretch' });
}

/** A `columns` block with at least one stack per column; extra stacks (content) are never removed. */
function withColumnStacks(block: Block): Block {
    const count = (block.props as PropsByType['columns']).count;
    const children = block.children ?? [];
    if (children.length >= count) return block;
    return { ...block, children: [...children, ...Array.from({ length: count - children.length }, columnStack)] };
}

/** New block with default props. Containers start empty except `columns`, which gets one stack per column. */
export function createBlock<T extends BlockType>(type: T, props?: Partial<PropsByType[T]>): Block<T> {
    const block = { id: newId(), type, props: { ...defaultProps(type), ...props } } as unknown as Block;
    if (type === 'columns') return withColumnStacks({ ...block, children: [] }) as Block<T>;
    if (isContainerType(type)) block.children = [];
    return block as Block<T>;
}

// ---------------------------------------------------------------------------------------------
// Tree operations (all immutable: they return new arrays/objects along the changed path)
// ---------------------------------------------------------------------------------------------

export interface BlockLocation {
    block: Block;
    /** Id of the containing block, `null` at the document root. */
    parentId: string | null;
    parentType: BlockType | null;
    index: number;
    siblings: Block[];
    depth: number;
}

export function findBlock(blocks: Block[], id: string, parent: Block | null = null, depth = 1): BlockLocation | null {
    for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        if (block.id === id) {
            return {
                block,
                parentId: parent?.id ?? null,
                parentType: parent?.type ?? null,
                index,
                siblings: blocks,
                depth,
            };
        }
        if (block.children) {
            const found = findBlock(block.children, id, block, depth + 1);
            if (found) return found;
        }
    }
    return null;
}

/** Depth-first list of every block with its depth (1 = root). */
export function flatten(blocks: Block[], depth = 1, out: { block: Block; depth: number }[] = []) {
    for (const block of blocks) {
        out.push({ block, depth });
        if (block.children) flatten(block.children, depth + 1, out);
    }
    return out;
}

export function countBlocks(blocks: Block[]): number {
    return flatten(blocks).length;
}

/** Number of nesting levels of a subtree (a leaf is 1). */
export function subtreeDepth(block: Block): number {
    return 1 + Math.max(0, ...(block.children ?? []).map(subtreeDepth));
}

/** Nesting rules: only containers hold children; sections live at the root only. */
export function canContain(parentType: BlockType | null, childType: BlockType): boolean {
    if (parentType === null) return true;
    if (!isContainerType(parentType)) return false;
    return !BLOCK_REGISTRY[childType].rootOnly;
}

/** Whether `block` may be placed inside `parentId` (null = root) given nesting rules and depth limit. */
export function canPlace(blocks: Block[], block: Block, parentId: string | null): boolean {
    if (parentId === null) return subtreeDepth(block) <= LIMITS.depth;
    const parent = findBlock(blocks, parentId);
    if (!parent || !canContain(parent.block.type, block.type)) return false;
    // Cannot drop a block inside itself.
    if (findBlock([block], parentId)) return false;
    return parent.depth + subtreeDepth(block) <= LIMITS.depth;
}

function mapChildren(blocks: Block[], parentId: string | null, fn: (children: Block[]) => Block[]): Block[] {
    if (parentId === null) return fn(blocks);
    return blocks.map((block) => {
        if (block.id === parentId) return { ...block, children: fn(block.children ?? []) } as Block;
        if (block.children) {
            const next = mapChildren(block.children, parentId, fn);
            if (next !== block.children) return { ...block, children: next } as Block;
        }
        return block;
    });
}

export function setChildren(blocks: Block[], parentId: string | null, children: Block[]): Block[] {
    return mapChildren(blocks, parentId, () => children);
}

export function insertBlock(blocks: Block[], parentId: string | null, index: number, block: Block): Block[] {
    return mapChildren(blocks, parentId, (children) => {
        const at = Math.max(0, Math.min(index, children.length));
        return [...children.slice(0, at), block, ...children.slice(at)];
    });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
    const location = findBlock(blocks, id);
    if (!location) return blocks;
    return mapChildren(blocks, location.parentId, (children) => children.filter((child) => child.id !== id));
}

/** Moves a block to `index` inside `parentId`; `index` refers to the siblings after the block was removed. */
export function moveBlock(blocks: Block[], id: string, parentId: string | null, index: number): Block[] {
    const location = findBlock(blocks, id);
    if (!location || !canPlace(blocks, location.block, parentId)) return blocks;
    return insertBlock(removeBlock(blocks, id), parentId, index, location.block);
}

/** Moves a block one position among its siblings. */
export function shiftBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
    const location = findBlock(blocks, id);
    if (!location) return blocks;
    const target = location.index + delta;
    if (target < 0 || target >= location.siblings.length) return blocks;
    return moveBlock(blocks, id, location.parentId, target);
}

/** Merges `props` into a block. Raising a `columns` count adds the missing column stacks. */
export function updateBlock<T extends BlockType>(blocks: Block[], id: string, props: Partial<PropsByType[T]>): Block[] {
    return blocks.map((block) => {
        if (block.id === id) {
            const updated = { ...block, props: { ...block.props, ...props } } as Block;
            return updated.type === 'columns' && 'count' in props ? withColumnStacks(updated) : updated;
        }
        if (block.children) {
            const next = updateBlock(block.children, id, props);
            if (next !== block.children) return { ...block, children: next } as Block;
        }
        return block;
    });
}

/** Deep clone with fresh ids. */
export function cloneWithNewIds(block: Block): Block {
    const copy = structuredClone(block) as Block;
    const reId = (node: Block) => {
        node.id = newId();
        node.children?.forEach(reId);
    };
    reId(copy);
    return copy;
}

/** Inserts a copy right after the original. Returns the new tree and the copy's id. */
export function duplicateBlock(blocks: Block[], id: string): { blocks: Block[]; id: string } | null {
    const location = findBlock(blocks, id);
    if (!location) return null;
    const copy = cloneWithNewIds(location.block);
    return { blocks: insertBlock(blocks, location.parentId, location.index + 1, copy), id: copy.id };
}

/**
 * Where a new block of `type` lands when inserted without a drop target: inside the selected
 * container, otherwise right after the selected block, otherwise at the end of the document.
 */
export function insertionPoint(
    blocks: Block[],
    selectedId: string | null,
    type: BlockType,
): { parentId: string | null; index: number } {
    const selected = selectedId ? findBlock(blocks, selectedId) : null;
    if (!selected) return { parentId: null, index: blocks.length };
    if (isContainerType(selected.block.type) && canContain(selected.block.type, type)) {
        return { parentId: selected.block.id, index: selected.block.children?.length ?? 0 };
    }
    if (canContain(selected.parentType, type)) return { parentId: selected.parentId, index: selected.index + 1 };
    // e.g. a section cannot go inside another container: place it after the top-level ancestor.
    let top = selected;
    while (top.parentId) top = findBlock(blocks, top.parentId)!;
    return { parentId: null, index: top.index + 1 };
}
