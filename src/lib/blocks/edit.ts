/**
 * Editing rules of the block editor as pure commands: each takes the current tree and returns the
 * edit to apply (`{ blocks, select? }`) or a failure. No DOM, no Svelte; `document.ts` holds the
 * primitive tree operations these are built from.
 */
import {
    canContain,
    canPlace,
    createBlock,
    findBlock,
    flatten,
    insertBlock,
    insertionPoint,
    moveBlock,
    removeBlock,
    setChildren,
} from './document';
import { markdownToBlocks } from './from-markdown';
import type { Block, BlockType } from './types';

/** A new tree and what to select afterwards (`undefined` keeps the selection). */
export interface Edit {
    blocks: Block[];
    select?: string | null;
}

/** `no-target`: nothing to act on; `blocked`: the nesting rules refuse it; `unchanged`: it would land where it already is. */
export interface EditFailure {
    error: 'no-target' | 'blocked' | 'unchanged';
}

export type EditResult = Edit | EditFailure;

export function failed(result: EditResult): result is EditFailure {
    return 'error' in result;
}

/** What is being dropped: a new block of a type, or an existing block that moves. */
export type DropSource = { kind: 'new'; type: BlockType } | { kind: 'move'; id: string };

/** Insert before `beforeId` inside `parentId` (`null` parent = document root, `null` before = at the end). */
export interface DropTarget {
    parentId: string | null;
    beforeId: string | null;
}

/** Whether the nesting rules and depth limit let `source` be placed inside `parentId` (null = root). */
export function canDrop(blocks: Block[], source: DropSource, parentId: string | null): boolean {
    if (source.kind === 'new') return canPlace(blocks, createBlock(source.type), parentId);
    const location = findBlock(blocks, source.id);
    return location !== null && canPlace(blocks, location.block, parentId);
}

/** Position of `beforeId` among the children of `parentId` in `tree`; the end when it is `null` or absent. */
function indexOfBefore(tree: Block[], target: DropTarget): number {
    const siblings = target.parentId === null ? tree : (findBlock(tree, target.parentId)?.block.children ?? []);
    if (target.beforeId === null) return siblings.length;
    const index = siblings.findIndex((block) => block.id === target.beforeId);
    return index === -1 ? siblings.length : index;
}

/** The one decision behind every drag and click placement: palette, canvas chip and layers list. */
export function resolveDrop(blocks: Block[], source: DropSource, target: DropTarget): EditResult {
    if (source.kind === 'new') {
        const block = createBlock(source.type);
        if (!canPlace(blocks, block, target.parentId)) return { error: 'blocked' };
        const index = indexOfBefore(blocks, target);
        return { blocks: insertBlock(blocks, target.parentId, index, block), select: block.id };
    }
    const location = findBlock(blocks, source.id);
    if (!location) return { error: 'no-target' };
    // `moveBlock` counts the index among the siblings left after the block is lifted out.
    const index = indexOfBefore(removeBlock(blocks, source.id), target);
    if (location.parentId === target.parentId && location.index === index) return { error: 'unchanged' };
    const next = moveBlock(blocks, source.id, target.parentId, index);
    return next === blocks ? { error: 'blocked' } : { blocks: next, select: source.id };
}

/** Adds a new block without a drop target: inside the selected container, else after the selection, else at the end. */
export function insertNew(blocks: Block[], type: BlockType, selectedId: string | null): EditResult {
    const point = insertionPoint(blocks, selectedId, type);
    const siblings = point.parentId === null ? blocks : (findBlock(blocks, point.parentId)?.block.children ?? []);
    return resolveDrop(
        blocks,
        { kind: 'new', type },
        { parentId: point.parentId, beforeId: siblings[point.index]?.id ?? null },
    );
}

/** Deletes a block and selects its next sibling, else the previous one, else the parent. */
export function deleteBlock(blocks: Block[], id: string): EditResult {
    const location = findBlock(blocks, id);
    if (!location) return { error: 'no-target' };
    const neighbour = location.siblings[location.index + 1] ?? location.siblings[location.index - 1];
    return { blocks: removeBlock(blocks, id), select: neighbour?.id ?? location.parentId };
}

/** Moves a block out of its container, right after that container. */
export function outdentBlock(blocks: Block[], id: string): EditResult {
    const location = findBlock(blocks, id);
    const parent = location?.parentId ? findBlock(blocks, location.parentId) : null;
    if (!location || !parent) return { error: 'no-target' };
    const next = moveBlock(blocks, id, parent.parentId, parent.index + 1);
    return next === blocks ? { error: 'blocked' } : { blocks: next };
}

/** Moves a block into the nearest earlier sibling that can contain it, at its end. */
export function indentBlock(blocks: Block[], id: string): EditResult {
    const location = findBlock(blocks, id);
    if (!location) return { error: 'no-target' };
    const previous = location.siblings
        .slice(0, location.index)
        .reverse()
        .find((block) => canContain(block.type, location.block.type));
    if (!previous) return { error: 'no-target' };
    const next = moveBlock(blocks, id, previous.id, previous.children?.length ?? 0);
    return next === blocks ? { error: 'blocked' } : { blocks: next };
}

/** Replaces Markdown blocks by the blocks they convert to: the block `id`, or every Markdown block when omitted. */
export function convertMarkdown(blocks: Block[], id?: string): EditResult {
    const ids = id === undefined ? flatten(blocks).map(({ block }) => block.id) : [id];
    let next = blocks;
    let first: string | null = null;
    for (const blockId of ids) {
        const location = findBlock(next, blockId);
        if (!location || location.block.type !== 'markdown') continue;
        const converted = markdownToBlocks(location.block.props.source);
        if (converted.length === 0) continue;
        first ??= converted[0].id;
        next = setChildren(next, location.parentId, [
            ...location.siblings.slice(0, location.index),
            ...converted,
            ...location.siblings.slice(location.index + 1),
        ]);
    }
    return first === null ? { error: 'no-target' } : { blocks: next, select: first };
}
