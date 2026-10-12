import { describe, expect, it } from 'vite-plus/test';
import {
    canIndent,
    indent,
    moveDown,
    moveUp,
    navUrlError,
    outdent,
    reorderError,
    toPayload,
    treeFromPayload,
    type NavNode,
} from './nav-tree';

const n = (id: number, children: NavNode[] = []): NavNode => ({
    id,
    label: `L${id}`,
    url: '/',
    isActive: true,
    order: id,
    children,
});

const ids = (tree: NavNode[]) => tree.map((t) => [t.id, t.children.map((c) => c.id)]);

describe('nav tree moves', () => {
    const tree = [n(1), n(2), n(3, [n(4), n(5)])];

    it('moves within siblings and stops at the edges', () => {
        expect(ids(moveUp(tree, 2)!)).toEqual([
            [2, []],
            [1, []],
            [3, [4, 5]],
        ]);
        expect(moveUp(tree, 1)).toBeNull();
        expect(ids(moveDown(tree, 4)!)).toEqual([
            [1, []],
            [2, []],
            [3, [5, 4]],
        ]);
        expect(moveDown(tree, 5)).toBeNull();
    });

    it('indents childless links under the previous link only', () => {
        expect(ids(indent(tree, 2)!)).toEqual([
            [1, [2]],
            [3, [4, 5]],
        ]);
        expect(canIndent(tree, 1)).toBe(false);
        expect(canIndent(tree, 4)).toBe(false);
        expect(indent([n(1), n(2, [n(3)])], 2)).toBeNull();
    });

    it('outdents a child after its parent', () => {
        expect(ids(outdent(tree, 4)!)).toEqual([
            [1, []],
            [2, []],
            [3, [5]],
            [4, []],
        ]);
        expect(outdent(tree, 1)).toBeNull();
    });

    it('round-trips through a payload', () => {
        const payload = toPayload(tree);
        expect(payload).toContainEqual({ id: 5, parentId: 3, order: 2 });
        expect(ids(treeFromPayload(tree, payload))).toEqual(ids(tree));
    });
});

describe('reorderError', () => {
    const existing = [
        { id: 1, parentId: null },
        { id: 2, parentId: null },
        { id: 3, parentId: 2 },
    ];
    it('accepts a valid tree', () => {
        expect(
            reorderError(
                [
                    { id: 2, parentId: null, order: 1 },
                    { id: 1, parentId: 2, order: 1 },
                ],
                [
                    { id: 1, parentId: null },
                    { id: 2, parentId: null },
                ],
            ),
        ).toBeNull();
    });
    it('rejects unknown ids, duplicates and self parents', () => {
        expect(reorderError([{ id: 9, parentId: null, order: 1 }], existing)).toMatch(/no longer exists/);
        expect(
            reorderError(
                [
                    { id: 1, parentId: null, order: 1 },
                    { id: 1, parentId: null, order: 2 },
                ],
                existing,
            ),
        ).toMatch(/more than once/);
        expect(reorderError([{ id: 1, parentId: 1, order: 1 }], existing)).toMatch(/own parent/);
    });
    it('rejects a third level', () => {
        expect(reorderError([{ id: 2, parentId: 1, order: 1 }], existing)).toMatch(/two levels/);
        expect(reorderError([{ id: 3, parentId: 3, order: 1 }], existing)).toMatch(/own parent/);
        expect(reorderError([{ id: 1, parentId: 3, order: 1 }], existing)).toMatch(/two levels/);
    });
});

describe('navUrlError', () => {
    it('allows paths, anchors and safe schemes', () => {
        for (const url of ['/', '/posts', '#departments', 'https://example.com/a', 'mailto:a@b.co', 'tel:+6312345'])
            expect(navUrlError(url)).toBeNull();
    });
    it('rejects unsafe or malformed values', () => {
        for (const url of ['', 'javascript:alert(1)', 'data:text/html,x', '//evil.com', 'posts', '/a b'])
            expect(navUrlError(url)).not.toBeNull();
    });
});
