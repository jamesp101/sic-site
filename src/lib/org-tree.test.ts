import { describe, expect, it } from 'vite-plus/test';
import {
    applyPlacements,
    buildOrgTree,
    canDrop,
    hasCycle,
    invertPlacements,
    keyboardMove,
    matchMembers,
    moveMember,
    moveRelative,
    moveToRoot,
    nextOrder,
    parentOptions,
    placementsError,
    positionOf,
    removeMember,
    reparentOnDelete,
    siblingsOf,
    subtreeIds,
    wouldCycle,
    type OrgMember,
    type OrgNode,
} from './org-tree';

const m = (id: number, parentId: number | null, order: number, name = `M${id}`): OrgMember => ({
    id,
    name,
    role: `Role ${id}`,
    parentId,
    order,
    imageUrl: null,
});

/*
 * 1 Dean
 * ├─ 2 CS head
 * │  └─ 4 Instructor
 * └─ 3 IS head
 *    └─ 5 Instructor
 * 6 Registrar (second root)
 */
const sample = (): OrgMember[] => [m(1, null, 1), m(2, 1, 1), m(3, 1, 2), m(4, 2, 1), m(5, 3, 1), m(6, null, 2)];

const shape = (nodes: OrgNode[]): unknown[] =>
    nodes.map((n) => (n.children.length ? [n.member.id, shape(n.children)] : n.member.id));
const shapeOf = (members: OrgMember[]) => shape(buildOrgTree(members));

describe('buildOrgTree', () => {
    it('nests by parent and sorts siblings by order then id', () => {
        expect(shapeOf(sample())).toEqual([
            [
                1,
                [
                    [2, [4]],
                    [3, [5]],
                ],
            ],
            6,
        ]);
        expect(shapeOf([m(3, null, 2), m(2, null, 1), m(1, null, 1)])).toEqual([1, 2, 3]);
    });

    it('treats dangling parents as roots and surfaces cycles', () => {
        expect(shapeOf([m(1, 99, 1), m(2, 1, 1)])).toEqual([[1, [2]]]);
        const looped = buildOrgTree([m(1, 2, 1), m(2, 1, 1), m(3, null, 1)]);
        expect(looped.map((n) => n.member.id).sort((a, b) => a - b)).toEqual([1, 3]);
        const ids = (nodes: OrgNode[]): number[] => nodes.flatMap((n) => [n.member.id, ...ids(n.children)]);
        expect(ids(looped).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('returns an empty forest for no members', () => {
        expect(buildOrgTree([])).toEqual([]);
    });
});

describe('cycle detection', () => {
    it('subtreeIds includes the root and all descendants', () => {
        expect([...subtreeIds(sample(), 2)].sort((a, b) => a - b)).toEqual([2, 4]);
        expect([...subtreeIds(sample(), 1)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });

    it('wouldCycle rejects self and descendants but allows others', () => {
        expect(wouldCycle(sample(), 1, 1)).toBe(true);
        expect(wouldCycle(sample(), 1, 4)).toBe(true);
        expect(wouldCycle(sample(), 2, 3)).toBe(false);
        expect(wouldCycle(sample(), 4, null)).toBe(false);
    });

    it('hasCycle finds loops in a full parent map', () => {
        expect(hasCycle(sample())).toBe(false);
        expect(hasCycle([m(1, 2, 1), m(2, 3, 1), m(3, 1, 1)])).toBe(true);
        expect(hasCycle([m(1, 1, 1)])).toBe(true);
    });

    it('canDrop forbids dropping onto itself or its own subtree', () => {
        expect(canDrop(sample(), 2, 2)).toBe(false);
        expect(canDrop(sample(), 1, 5)).toBe(false);
        expect(canDrop(sample(), 4, 3)).toBe(true);
    });
});

describe('moveMember / moveRelative', () => {
    it('reparents under another member and renumbers both sibling lists', () => {
        const moved = moveRelative(sample(), 4, 3, 'child')!;
        expect(moved).toEqual(expect.arrayContaining([{ id: 4, parentId: 3, order: 2 }]));
        expect(shapeOf(applyPlacements(sample(), moved))).toEqual([[1, [2, [3, [5, 4]]]], 6]);
    });

    it('reorders among siblings and reports only changed rows', () => {
        const moved = moveRelative(sample(), 3, 2, 'before')!;
        expect(moved).toEqual([
            { id: 3, parentId: 1, order: 1 },
            { id: 2, parentId: 1, order: 2 },
        ]);
        expect(shapeOf(applyPlacements(sample(), moved))).toEqual([
            [
                1,
                [
                    [3, [5]],
                    [2, [4]],
                ],
            ],
            6,
        ]);
    });

    it('places after a target and between roots', () => {
        expect(shapeOf(applyPlacements(sample(), moveRelative(sample(), 2, 3, 'after')!))).toEqual([
            [
                1,
                [
                    [3, [5]],
                    [2, [4]],
                ],
            ],
            6,
        ]);
        expect(shapeOf(applyPlacements(sample(), moveRelative(sample(), 4, 1, 'before')!))).toEqual([
            4,
            [1, [2, [3, [5]]]],
            6,
        ]);
    });

    it('moveToRoot makes the member the last root', () => {
        const moved = moveToRoot(sample(), 3)!;
        expect(shapeOf(applyPlacements(sample(), moved))).toEqual([[1, [[2, [4]]]], 6, [3, [5]]]);
    });

    it('returns [] for a no-op and null for an illegal move', () => {
        expect(moveRelative(sample(), 2, 3, 'before')).toEqual([]);
        expect(moveRelative(sample(), 1, 4, 'child')).toBeNull();
        expect(moveRelative(sample(), 1, 1, 'after')).toBeNull();
        expect(moveMember(sample(), 1, 99, 0)).toBeNull();
        expect(moveMember(sample(), 99, null, 0)).toBeNull();
    });

    it('clamps the index', () => {
        expect(shapeOf(applyPlacements(sample(), moveMember(sample(), 2, 1, 50)!))).toEqual([
            [
                1,
                [
                    [3, [5]],
                    [2, [4]],
                ],
            ],
            6,
        ]);
        expect(shapeOf(applyPlacements(sample(), moveMember(sample(), 3, 1, -4)!))).toEqual([
            [
                1,
                [
                    [3, [5]],
                    [2, [4]],
                ],
            ],
            6,
        ]);
    });

    it('invertPlacements restores the previous state', () => {
        const forward = moveRelative(sample(), 4, 3, 'child')!;
        const back = invertPlacements(sample(), forward);
        expect(applyPlacements(applyPlacements(sample(), forward), back)).toEqual(sample());
    });
});

describe('keyboardMove', () => {
    const apply = (id: number, move: Parameters<typeof keyboardMove>[2]) => {
        const placements = keyboardMove(sample(), id, move);
        return placements && shapeOf(applyPlacements(sample(), placements));
    };

    it('up and down swap with a sibling', () => {
        expect(apply(3, 'up')).toEqual([
            [
                1,
                [
                    [3, [5]],
                    [2, [4]],
                ],
            ],
            6,
        ]);
        expect(apply(2, 'down')).toEqual([
            [
                1,
                [
                    [3, [5]],
                    [2, [4]],
                ],
            ],
            6,
        ]);
        expect(apply(2, 'up')).toBeNull();
        expect(apply(3, 'down')).toBeNull();
        expect(apply(1, 'down')).toEqual([
            6,
            [
                1,
                [
                    [2, [4]],
                    [3, [5]],
                ],
            ],
        ]);
    });

    it('out reports to the grandparent right after the former manager', () => {
        expect(apply(4, 'out')).toEqual([[1, [2, 4, [3, [5]]]], 6]);
        expect(apply(2, 'out')).toEqual([[1, [[3, [5]]]], [2, [4]], 6]);
        expect(apply(1, 'out')).toBeNull();
    });

    it('in reports to the previous sibling', () => {
        expect(apply(3, 'in')).toEqual([[1, [[2, [4, [3, [5]]]]]], 6]);
        expect(apply(6, 'in')).toEqual([[1, [[2, [4]], [3, [5]], 6]]]);
        expect(apply(2, 'in')).toBeNull();
        expect(keyboardMove(sample(), 99, 'up')).toBeNull();
    });
});

describe('reparentOnDelete', () => {
    it('moves reports up to the manager in the deleted member’s slot, keeping order', () => {
        const members = [...sample(), m(7, 1, 3)];
        const payload = reparentOnDelete(members, 2);
        expect(payload).toEqual([{ id: 4, parentId: 1, order: 1 }]);
        expect(shapeOf(removeMember(members, 2))).toEqual([[1, [4, [3, [5]], 7]], 6]);
    });

    it('makes reports of a root top-level, between the neighbouring roots', () => {
        const payload = reparentOnDelete(sample(), 1);
        expect(payload).toEqual([
            { id: 2, parentId: null, order: 1 },
            { id: 3, parentId: null, order: 2 },
            { id: 6, parentId: null, order: 3 },
        ]);
        expect(shapeOf(removeMember(sample(), 1))).toEqual([[2, [4]], [3, [5]], 6]);
    });

    it('is empty for a leaf whose siblings need no renumbering, and for unknown ids', () => {
        expect(reparentOnDelete(sample(), 6)).toEqual([]);
        expect(reparentOnDelete(sample(), 99)).toEqual([]);
        expect(shapeOf(removeMember(sample(), 6))).toEqual([
            [
                1,
                [
                    [2, [4]],
                    [3, [5]],
                ],
            ],
        ]);
    });
});

describe('placementsError', () => {
    it('accepts a valid payload', () => {
        expect(placementsError(sample(), [{ id: 4, parentId: 3, order: 2 }])).toBeNull();
        expect(placementsError(sample(), [{ id: 2, parentId: null, order: 1 }])).toBeNull();
    });

    it('rejects foreign ids, foreign parents, duplicates, self parents and cycles', () => {
        expect(placementsError(sample(), [{ id: 99, parentId: null, order: 1 }])).toMatch(/department/);
        expect(placementsError(sample(), [{ id: 2, parentId: 99, order: 1 }])).toMatch(/parent/);
        expect(
            placementsError(sample(), [
                { id: 2, parentId: 1, order: 1 },
                { id: 2, parentId: 1, order: 2 },
            ]),
        ).toMatch(/more than once/);
        expect(placementsError(sample(), [{ id: 2, parentId: 2, order: 1 }])).toMatch(/itself/);
        expect(placementsError(sample(), [{ id: 1, parentId: 4, order: 1 }])).toMatch(/subordinates/);
        expect(placementsError(sample(), [{ id: 2, parentId: 4, order: 1 }])).toMatch(/subordinates/);
    });
});

describe('misc helpers', () => {
    it('siblingsOf, nextOrder and positionOf', () => {
        expect(siblingsOf(sample(), null).map((x) => x.id)).toEqual([1, 6]);
        expect(nextOrder(sample(), 1)).toBe(3);
        expect(nextOrder(sample(), 4)).toBe(1);
        expect(positionOf(sample(), 5)).toEqual({ index: 1, count: 1, level: 3, parentId: 3 });
        expect(positionOf(sample(), 6)).toEqual({ index: 2, count: 2, level: 1, parentId: null });
    });

    it('parentOptions is depth-first and excludes the member and its subtree', () => {
        expect(parentOptions(sample()).map((o) => [o.id, o.depth])).toEqual([
            [1, 0],
            [2, 1],
            [4, 2],
            [3, 1],
            [5, 2],
            [6, 0],
        ]);
        expect(parentOptions(sample(), 2).map((o) => o.id)).toEqual([1, 3, 5, 6]);
    });

    it('matchMembers searches name and role case-insensitively', () => {
        const members = [m(1, null, 1, 'Ada Lovelace'), m(2, null, 2, 'Grace Hopper')];
        expect(matchMembers(members, 'LOVE')).toEqual([1]);
        expect(matchMembers(members, 'role 2')).toEqual([2]);
        expect(matchMembers(members, '  ')).toEqual([]);
    });
});
