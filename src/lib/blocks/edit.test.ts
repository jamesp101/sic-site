import { describe, expect, it } from 'vite-plus/test';
import { createBlock, findBlock } from './document';
import {
    canDrop,
    convertMarkdown,
    deleteBlock,
    failed,
    indentBlock,
    insertNew,
    outdentBlock,
    resolveDrop,
    type Edit,
    type EditResult,
} from './edit';
import { LIMITS, type Block } from './types';

function edit(result: EditResult): Edit {
    if (failed(result)) throw new Error(`expected an edit, got ${result.error}`);
    return result;
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

const ids = (blocks: Block[]) => blocks.map((block) => block.id);

describe('canDrop', () => {
    it('applies the nesting rules to new and moved blocks alike', () => {
        const { blocks, row, section, heading, p1 } = fixture();
        expect(canDrop(blocks, { kind: 'new', type: 'paragraph' }, row.id)).toBe(true);
        expect(canDrop(blocks, { kind: 'new', type: 'paragraph' }, p1.id)).toBe(false);
        expect(canDrop(blocks, { kind: 'new', type: 'section' }, row.id)).toBe(false);
        expect(canDrop(blocks, { kind: 'new', type: 'section' }, null)).toBe(true);
        expect(canDrop(blocks, { kind: 'new', type: 'paragraph' }, 'missing')).toBe(false);
        expect(canDrop(blocks, { kind: 'move', id: heading.id }, row.id)).toBe(true);
        expect(canDrop(blocks, { kind: 'move', id: section.id }, row.id)).toBe(false);
        expect(canDrop(blocks, { kind: 'move', id: 'missing' }, null)).toBe(false);
    });

    it('counts the stacks of a new columns block towards the depth limit', () => {
        let row = createBlock('row');
        const root = row;
        for (let depth = 2; depth < LIMITS.depth; depth++) {
            const child = createBlock('row');
            row.children = [child];
            row = child;
        }
        const tree = [root];
        expect(canDrop(tree, { kind: 'new', type: 'paragraph' }, row.id)).toBe(true);
        expect(canDrop(tree, { kind: 'new', type: 'columns' }, row.id)).toBe(false);
    });

    it('refuses to move a block into itself or its descendants', () => {
        const { blocks, section, row } = fixture();
        expect(canDrop(blocks, { kind: 'move', id: row.id }, row.id)).toBe(false);
        expect(canDrop(blocks, { kind: 'move', id: section.id }, section.id)).toBe(false);
    });
});

describe('resolveDrop', () => {
    it('inserts a new block before the target sibling and selects it', () => {
        const { blocks, row, p2 } = fixture();
        const result = edit(
            resolveDrop(blocks, { kind: 'new', type: 'divider' }, { parentId: row.id, beforeId: p2.id }),
        );
        const children = findBlock(result.blocks, row.id)!.block.children!;
        expect(children.map((child) => child.type)).toEqual(['paragraph', 'divider', 'paragraph']);
        expect(result.select).toBe(children[1].id);
    });

    it('appends when there is no before id, or it is unknown', () => {
        const { blocks, row } = fixture();
        for (const beforeId of [null, 'missing']) {
            const result = edit(resolveDrop(blocks, { kind: 'new', type: 'divider' }, { parentId: row.id, beforeId }));
            expect(findBlock(result.blocks, row.id)!.block.children!.at(-1)!.type).toBe('divider');
        }
    });

    it('rejects a placement the nesting rules refuse', () => {
        const { blocks, row } = fixture();
        expect(resolveDrop(blocks, { kind: 'new', type: 'section' }, { parentId: row.id, beforeId: null })).toEqual({
            error: 'blocked',
        });
    });

    it('moves a block counting the index after it was lifted out', () => {
        const { blocks, row, p1, p2 } = fixture();
        // Dropping p1 "before nothing" in its own row sends it to the end.
        const toEnd = edit(resolveDrop(blocks, { kind: 'move', id: p1.id }, { parentId: row.id, beforeId: null }));
        expect(ids(findBlock(toEnd.blocks, row.id)!.block.children!)).toEqual([p2.id, p1.id]);
        expect(toEnd.select).toBe(p1.id);
    });

    it('moves a block across parents', () => {
        const { blocks, row, p1, heading } = fixture();
        const result = edit(
            resolveDrop(blocks, { kind: 'move', id: heading.id }, { parentId: row.id, beforeId: p1.id }),
        );
        expect(ids(findBlock(result.blocks, row.id)!.block.children!)[0]).toBe(heading.id);
        expect(result.blocks).toHaveLength(1);
    });

    it('reports a drop onto the current position as unchanged', () => {
        const { blocks, row, p1, p2 } = fixture();
        expect(resolveDrop(blocks, { kind: 'move', id: p1.id }, { parentId: row.id, beforeId: p2.id })).toEqual({
            error: 'unchanged',
        });
        expect(resolveDrop(blocks, { kind: 'move', id: p2.id }, { parentId: row.id, beforeId: null })).toEqual({
            error: 'unchanged',
        });
    });

    it('refuses to drop a block into itself and reports missing blocks', () => {
        const { blocks, row } = fixture();
        expect(resolveDrop(blocks, { kind: 'move', id: row.id }, { parentId: row.id, beforeId: null })).toEqual({
            error: 'blocked',
        });
        expect(resolveDrop(blocks, { kind: 'move', id: 'missing' }, { parentId: null, beforeId: null })).toEqual({
            error: 'no-target',
        });
    });
});

describe('insertNew', () => {
    it('adds inside the selected container, after a selected leaf, or at the end', () => {
        const { blocks, row, p1, p2 } = fixture();
        const inside = edit(insertNew(blocks, 'divider', row.id));
        expect(findBlock(inside.blocks, row.id)!.block.children!.at(-1)!.type).toBe('divider');
        const after = edit(insertNew(blocks, 'divider', p1.id));
        expect(findBlock(after.blocks, row.id)!.block.children!.map((child) => child.type)).toEqual([
            'paragraph',
            'divider',
            'paragraph',
        ]);
        expect(findBlock(after.blocks, p2.id)).not.toBeNull();
        expect(edit(insertNew(blocks, 'divider', null)).blocks.at(-1)!.type).toBe('divider');
    });
});

describe('deleteBlock', () => {
    it('selects the next sibling, else the previous one, else the parent', () => {
        const { blocks, row, p1, p2 } = fixture();
        expect(edit(deleteBlock(blocks, p1.id)).select).toBe(p2.id);
        expect(edit(deleteBlock(blocks, p2.id)).select).toBe(p1.id);
        const only = edit(deleteBlock(blocks, p2.id));
        expect(edit(deleteBlock(only.blocks, p1.id)).select).toBe(row.id);
    });

    it('selects nothing after deleting the last root block', () => {
        const block = createBlock('paragraph');
        const result = edit(deleteBlock([block], block.id));
        expect(result.blocks).toEqual([]);
        expect(result.select).toBeNull();
    });

    it('fails for an unknown block', () => {
        expect(deleteBlock(fixture().blocks, 'missing')).toEqual({ error: 'no-target' });
    });
});

describe('outdentBlock / indentBlock', () => {
    it('outdent moves a block right after its container', () => {
        const { blocks, row, p1, section } = fixture();
        const result = edit(outdentBlock(blocks, p1.id));
        expect(ids(findBlock(result.blocks, section.id)!.block.children!)).toEqual([row.id, p1.id]);
    });

    it('outdent fails for a block already at the root', () => {
        const { blocks, section } = fixture();
        expect(outdentBlock(blocks, section.id)).toEqual({ error: 'no-target' });
    });

    it('indent moves a block to the end of the nearest earlier container that accepts it', () => {
        const target = createBlock('row');
        const kept = createBlock('paragraph');
        target.children = [kept];
        const heading = createBlock('heading');
        const result = edit(indentBlock([target, heading], heading.id));
        expect(ids(findBlock(result.blocks, target.id)!.block.children!)).toEqual([kept.id, heading.id]);
        expect(result.blocks).toHaveLength(1);
    });

    it('indent skips earlier siblings that cannot contain the block, and fails without any', () => {
        const { blocks, p1, p2 } = fixture();
        expect(indentBlock(blocks, p2.id)).toEqual({ error: 'no-target' }); // p1 is a leaf
        expect(indentBlock(blocks, p1.id)).toEqual({ error: 'no-target' });
        expect(indentBlock(blocks, 'missing')).toEqual({ error: 'no-target' });
    });
});

describe('convertMarkdown', () => {
    const withMarkdown = () => {
        const a = createBlock('markdown', { source: '# Hello\n\nWorld' });
        const b = createBlock('markdown', { source: '' });
        const c = createBlock('markdown', { source: 'Tail' });
        const row = createBlock('row');
        row.children = [c];
        return { a, b, c, row, blocks: [a, b, row] as Block[] };
    };

    it('replaces one Markdown block by its blocks, in place, and selects the first', () => {
        const { a, b, row, blocks } = withMarkdown();
        const result = edit(convertMarkdown(blocks, a.id));
        expect(result.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'markdown', 'row']);
        expect(result.blocks[2].id).toBe(b.id);
        expect(result.blocks[3].id).toBe(row.id);
        expect(result.select).toBe(result.blocks[0].id);
    });

    it('converts every non-empty Markdown block, nested ones too, when no id is given', () => {
        const { b, blocks, c, row } = withMarkdown();
        const result = edit(convertMarkdown(blocks));
        expect(result.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'markdown', 'row']);
        expect(result.blocks[2].id).toBe(b.id);
        expect(findBlock(result.blocks, c.id)).toBeNull();
        expect(findBlock(result.blocks, row.id)!.block.children![0].type).toBe('paragraph');
    });

    it('fails when there is nothing to convert', () => {
        const { b, row, blocks } = withMarkdown();
        expect(convertMarkdown(blocks, b.id)).toEqual({ error: 'no-target' });
        expect(convertMarkdown(blocks, row.id)).toEqual({ error: 'no-target' });
        expect(convertMarkdown([createBlock('heading')])).toEqual({ error: 'no-target' });
    });
});
