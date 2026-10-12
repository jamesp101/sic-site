import { describe, expect, it } from 'vite-plus/test';
import {
    canContain,
    canPlace,
    countBlocks,
    createBlock,
    createDocument,
    defaultProps,
    duplicateBlock,
    emptyDocument,
    findBlock,
    flatten,
    insertBlock,
    insertionPoint,
    isBlockDocument,
    moveBlock,
    removeBlock,
    serializeDocument,
    shiftBlock,
    subtreeDepth,
    updateBlock,
} from './document';
import { LIMITS, type Block } from './types';

const doc = (blocks: Block[] = []) => serializeDocument(createDocument(blocks));

/** `depth` nested rows (the innermost one is empty). */
function nest(depth: number): Block {
    const row = createBlock('row');
    if (depth > 1) row.children = [nest(depth - 1)];
    return row;
}

/** section > row > [p1, p2], plus a root heading. */
function fixture() {
    const p1 = createBlock('paragraph', { text: 'one' });
    const p2 = createBlock('paragraph', { text: 'two' });
    const row = createBlock('row');
    row.children = [p1, p2];
    const section = createBlock('section');
    section.children = [row];
    const heading = createBlock('heading', { text: 'Title' });
    return { p1, p2, row, section, heading, blocks: [section, heading] as Block[] };
}

describe('isBlockDocument', () => {
    it('rejects empty values and plain Markdown', () => {
        expect(isBlockDocument(null)).toBe(false);
        expect(isBlockDocument(undefined)).toBe(false);
        expect(isBlockDocument('')).toBe(false);
        expect(isBlockDocument('# Welcome\n\nSome text')).toBe(false);
    });

    it('rejects Markdown that merely starts with a brace or mentions the marker', () => {
        expect(isBlockDocument('{curly} text about sic-blocks')).toBe(false);
        expect(isBlockDocument('{not json sic-blocks')).toBe(false);
        expect(isBlockDocument('Notes on "sic-blocks" documents')).toBe(false);
    });

    it('rejects JSON without the marker or with a different type', () => {
        expect(isBlockDocument('{"hello":"world"}')).toBe(false);
        expect(isBlockDocument('{"type":"other","note":"sic-blocks"}')).toBe(false);
        expect(isBlockDocument('["sic-blocks"]')).toBe(false);
    });

    it('accepts a valid document, also with surrounding whitespace', () => {
        const json = doc([createBlock('paragraph')]);
        expect(isBlockDocument(json)).toBe(true);
        expect(isBlockDocument(`  \n\t${json}\n`)).toBe(true);
        expect(isBlockDocument(doc())).toBe(true);
    });

    it('detects the marker even when blocks are malformed (validation happens elsewhere)', () => {
        expect(isBlockDocument('{"type":"sic-blocks","version":1,"blocks":"nope"}')).toBe(true);
    });
});

describe('document factories', () => {
    it('emptyDocument / createDocument carry the marker and version', () => {
        expect(emptyDocument()).toEqual({ type: 'sic-blocks', version: 1, blocks: [] });
        const block = createBlock('divider');
        expect(createDocument([block])).toEqual({ type: 'sic-blocks', version: 1, blocks: [block] });
    });

    it('createBlock fills defaults and lets props override them', () => {
        const heading = createBlock('heading');
        expect(heading.type).toBe('heading');
        expect(heading.props).toEqual(defaultProps('heading'));
        expect(heading.children).toBeUndefined();

        const custom = createBlock('heading', { text: 'Hi', level: 3 });
        expect(custom.props).toEqual({ text: 'Hi', level: 3, align: 'inherit' });
    });

    it('gives every block a fresh, valid id and fresh prop objects', () => {
        const a = createBlock('list');
        const b = createBlock('list');
        expect(a.id).not.toBe(b.id);
        expect(a.id).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
        a.props.items.push('mutated');
        expect(b.props.items).toEqual(['First item', 'Second item']);
        expect(defaultProps('list').items).toEqual(['First item', 'Second item']);
    });

    it('containers start with empty children', () => {
        for (const type of ['section', 'row', 'grid', 'card'] as const) {
            expect(createBlock(type).children).toEqual([]);
        }
    });

    it('columns get one column stack per column', () => {
        const two = createBlock('columns');
        expect(two.children).toHaveLength(2);
        for (const child of two.children ?? []) {
            expect(child.type).toBe('row');
            expect(child.props).toMatchObject({ direction: 'column', gap: 'sm', align: 'stretch' });
            expect(child.children).toEqual([]);
        }
        expect(createBlock('columns', { count: 3 }).children).toHaveLength(3);
        expect(new Set([...(two.children ?? [])].map((child) => child.id)).size).toBe(2);
    });
});

describe('queries', () => {
    it('findBlock reports parent, index and depth', () => {
        const { blocks, p2, row, section, heading } = fixture();
        const found = findBlock(blocks, p2.id);
        expect(found).toMatchObject({ parentId: row.id, parentType: 'row', index: 1, depth: 3 });
        expect(found?.block).toBe(p2);
        expect(findBlock(blocks, section.id)).toMatchObject({ parentId: null, parentType: null, index: 0, depth: 1 });
        expect(findBlock(blocks, heading.id)?.index).toBe(1);
        expect(findBlock(blocks, 'missing')).toBeNull();
    });

    it('flatten / countBlocks / subtreeDepth walk the whole tree', () => {
        const { blocks, section } = fixture();
        expect(countBlocks(blocks)).toBe(5);
        expect(flatten(blocks).map((entry) => entry.depth)).toEqual([1, 2, 3, 3, 1]);
        expect(subtreeDepth(section)).toBe(3);
        expect(subtreeDepth(createBlock('paragraph'))).toBe(1);
        expect(subtreeDepth(nest(4))).toBe(4);
    });
});

describe('nesting rules', () => {
    it('canContain: only containers hold children and sections stay at the root', () => {
        expect(canContain(null, 'section')).toBe(true);
        expect(canContain(null, 'paragraph')).toBe(true);
        expect(canContain('section', 'row')).toBe(true);
        expect(canContain('row', 'section')).toBe(false);
        expect(canContain('card', 'section')).toBe(false);
        expect(canContain('paragraph', 'paragraph')).toBe(false);
        expect(canContain('list', 'paragraph')).toBe(false);
    });

    it('canPlace checks parent existence, type rules and cycles', () => {
        const { blocks, row, section, p1 } = fixture();
        const newSection = createBlock('section');
        expect(canPlace(blocks, newSection, null)).toBe(true);
        expect(canPlace(blocks, newSection, row.id)).toBe(false);
        expect(canPlace(blocks, createBlock('paragraph'), row.id)).toBe(true);
        expect(canPlace(blocks, createBlock('paragraph'), p1.id)).toBe(false);
        expect(canPlace(blocks, createBlock('paragraph'), 'missing')).toBe(false);
        // A block cannot be dropped into itself or one of its descendants.
        expect(canPlace(blocks, section, row.id)).toBe(false);
        expect(canPlace(blocks, row, row.id)).toBe(false);
    });

    it('canPlace enforces the depth limit', () => {
        const deep = nest(LIMITS.depth);
        const blocks = [deep];
        const innermost = flatten(blocks).at(-1)!.block;
        const parentOfInnermost = flatten(blocks).at(-2)!.block;
        expect(flatten(blocks).at(-1)!.depth).toBe(LIMITS.depth);
        // A child under the deepest block would be level 7.
        expect(canPlace(blocks, createBlock('paragraph'), innermost.id)).toBe(false);
        // Under the second deepest it lands on level 6.
        expect(canPlace(blocks, createBlock('paragraph'), parentOfInnermost.id)).toBe(true);
        expect(canPlace(blocks, nest(2), parentOfInnermost.id)).toBe(false);
        // Root placement checks the subtree itself.
        expect(canPlace([], nest(LIMITS.depth), null)).toBe(true);
        expect(canPlace([], nest(LIMITS.depth + 1), null)).toBe(false);
    });
});

describe('tree operations', () => {
    it('insertBlock inserts at an index, clamps it and does not mutate', () => {
        const { blocks, row, p1, p2 } = fixture();
        const added = createBlock('divider');
        const next = insertBlock(blocks, row.id, 1, added);
        expect(findBlock(next, row.id)?.block.children?.map((child) => child.id)).toEqual([p1.id, added.id, p2.id]);
        expect(row.children).toHaveLength(2);
        expect(findBlock(blocks, added.id)).toBeNull();

        const first = insertBlock(blocks, null, -5, added);
        expect(first[0]).toBe(added);
        const last = insertBlock(blocks, null, 99, added);
        expect(last.at(-1)).toBe(added);
        expect(last).toHaveLength(3);
    });

    it('removeBlock removes nested blocks and returns the same array for unknown ids', () => {
        const { blocks, row, p1, p2 } = fixture();
        const next = removeBlock(blocks, p1.id);
        expect(findBlock(next, p1.id)).toBeNull();
        expect(findBlock(next, row.id)?.block.children).toEqual([p2]);
        expect(removeBlock(blocks, 'missing')).toBe(blocks);
        expect(removeBlock(blocks, row.id)[0].children).toEqual([]);
    });

    it('moveBlock reorders inside a parent (index counts siblings after removal)', () => {
        const a = createBlock('paragraph', { text: 'a' });
        const b = createBlock('paragraph', { text: 'b' });
        const c = createBlock('paragraph', { text: 'c' });
        const blocks: Block[] = [a, b, c];
        expect(moveBlock(blocks, a.id, null, 2).map((block) => block.id)).toEqual([b.id, c.id, a.id]);
        expect(moveBlock(blocks, c.id, null, 0).map((block) => block.id)).toEqual([c.id, a.id, b.id]);
    });

    it('moveBlock moves between parents and refuses illegal moves', () => {
        const { blocks, row, section, heading, p1 } = fixture();
        const out = moveBlock(blocks, p1.id, null, 0);
        expect(out[0].id).toBe(p1.id);
        expect(findBlock(out, row.id)?.block.children).toHaveLength(1);

        const into = moveBlock(blocks, heading.id, row.id, 0);
        expect(findBlock(into, row.id)?.block.children?.[0].id).toBe(heading.id);
        expect(into).toHaveLength(1);

        // A section cannot go into a row, a container cannot go into itself.
        expect(moveBlock(blocks, section.id, row.id, 0)).toBe(blocks);
        expect(moveBlock(blocks, row.id, row.id, 0)).toBe(blocks);
        expect(moveBlock(blocks, 'missing', null, 0)).toBe(blocks);
    });

    it('shiftBlock moves one step and stops at the edges', () => {
        const a = createBlock('paragraph');
        const b = createBlock('paragraph');
        const c = createBlock('paragraph');
        const blocks: Block[] = [a, b, c];
        expect(shiftBlock(blocks, a.id, 1).map((block) => block.id)).toEqual([b.id, a.id, c.id]);
        expect(shiftBlock(blocks, c.id, -1).map((block) => block.id)).toEqual([a.id, c.id, b.id]);
        expect(shiftBlock(blocks, a.id, -1)).toBe(blocks);
        expect(shiftBlock(blocks, c.id, 1)).toBe(blocks);
        expect(shiftBlock(blocks, 'missing', 1)).toBe(blocks);
    });

    it('shiftBlock works inside nested containers', () => {
        const { blocks, row, p1, p2 } = fixture();
        const next = shiftBlock(blocks, p1.id, 1);
        expect(findBlock(next, row.id)?.block.children?.map((child) => child.id)).toEqual([p2.id, p1.id]);
    });

    it('updateBlock merges props on nested blocks without touching the original', () => {
        const { blocks, p1 } = fixture();
        const next = updateBlock(blocks, p1.id, { text: 'changed' });
        expect(findBlock(next, p1.id)?.block.props).toMatchObject({ text: 'changed', size: 'base' });
        expect(p1.props).toMatchObject({ text: 'one' });
    });

    it('duplicateBlock inserts a copy right after the original with fresh unique ids', () => {
        const { blocks, section } = fixture();
        const result = duplicateBlock(blocks, section.id);
        expect(result).not.toBeNull();
        const next = result!.blocks;
        expect(next).toHaveLength(3);
        expect(next[1].id).toBe(result!.id);
        expect(next[1].id).not.toBe(section.id);
        expect(next[1].type).toBe('section');

        const ids = flatten(next).map((entry) => entry.block.id);
        expect(ids).toHaveLength(9);
        expect(new Set(ids).size).toBe(ids.length);
        // Content is copied, not shared.
        expect(next[1].children?.[0]).not.toBe(section.children?.[0]);
        expect(next[1].children?.[0].children?.map((child) => child.props)).toMatchObject([
            { text: 'one' },
            { text: 'two' },
        ]);
        expect(duplicateBlock(blocks, 'missing')).toBeNull();
    });

    it('duplicateBlock works for nested blocks', () => {
        const { blocks, row, p1 } = fixture();
        const result = duplicateBlock(blocks, p1.id)!;
        const children = findBlock(result.blocks, row.id)!.block.children!;
        expect(children).toHaveLength(3);
        expect(children[1].id).toBe(result.id);
    });
});

describe('insertionPoint', () => {
    it('appends to the document when nothing is selected', () => {
        const { blocks } = fixture();
        expect(insertionPoint(blocks, null, 'paragraph')).toEqual({ parentId: null, index: 2 });
        expect(insertionPoint(blocks, 'missing', 'paragraph')).toEqual({ parentId: null, index: 2 });
    });

    it('goes inside a selected container, at the end', () => {
        const { blocks, row } = fixture();
        expect(insertionPoint(blocks, row.id, 'paragraph')).toEqual({ parentId: row.id, index: 2 });
    });

    it('goes after a selected leaf, in its parent', () => {
        const { blocks, row, p1, heading } = fixture();
        expect(insertionPoint(blocks, p1.id, 'divider')).toEqual({ parentId: row.id, index: 1 });
        expect(insertionPoint(blocks, heading.id, 'divider')).toEqual({ parentId: null, index: 2 });
    });

    it('places a section after the top-level ancestor of the selection', () => {
        const { blocks, row, p2, section } = fixture();
        expect(insertionPoint(blocks, p2.id, 'section')).toEqual({ parentId: null, index: 1 });
        expect(insertionPoint(blocks, row.id, 'section')).toEqual({ parentId: null, index: 1 });
        expect(insertionPoint(blocks, section.id, 'section')).toEqual({ parentId: null, index: 1 });
    });
});
