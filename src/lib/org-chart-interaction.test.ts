import { describe, expect, it } from 'vite-plus/test';
import {
    MAX_SCALE,
    MIN_SCALE,
    afterDelete,
    canvasClick,
    closeInspector,
    commitRename,
    createdMember,
    dropZone,
    fitViewport,
    initialUi,
    isPanGesture,
    itemKeyIntent,
    nextSearchMatch,
    panBy,
    peerAnchor,
    revealShift,
    selectMember,
    setRenameValue,
    startCreate,
    startRename,
    wheelIntent,
    zoomAt,
    type KeyInput,
} from './org-chart-interaction';
import type { OrgMember } from './org-tree';

const member = (id: number, parentId: number | null, order: number, name = `M${id}`): OrgMember => ({
    id,
    name,
    role: '',
    parentId,
    order,
    imageUrl: null,
});

//  1
//  ├─ 2
//  │   └─ 4
//  └─ 3
const members = [member(1, null, 0), member(2, 1, 0), member(3, 1, 1), member(4, 2, 0)];
const flat = [1, 2, 4, 3];

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
    key: k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
});

describe('viewport', () => {
    it('fits large content down, centred, and never enlarges small content', () => {
        const big = fitViewport({ width: 1000, height: 800 }, { width: 2000, height: 400 });
        expect(big?.scale).toBeCloseTo((1000 - 48) / 2000);
        expect(big?.tx).toBeCloseTo((1000 - 2000 * big!.scale) / 2);
        const small = fitViewport({ width: 1000, height: 800 }, { width: 100, height: 100 });
        expect(small?.scale).toBe(1);
        expect(small?.tx).toBe(450);
    });

    it('clamps the fit scale and keeps a top margin for the toolbar', () => {
        const tiny = fitViewport({ width: 1000, height: 800 }, { width: 100000, height: 100 });
        expect(tiny?.scale).toBe(MIN_SCALE);
        expect(fitViewport({ width: 1000, height: 150 }, { width: 100, height: 90 })?.ty).toBe(56);
    });

    it('does not fit content that has no size yet', () => {
        expect(fitViewport({ width: 1000, height: 800 }, { width: 0, height: 100 })).toBeNull();
    });

    it('zooms around a fixed point', () => {
        const next = zoomAt({ scale: 1, tx: 10, ty: 20 }, 2, 110, 120);
        expect(next.scale).toBe(2);
        // The content point under (110,120) stays under it.
        expect((110 - next.tx) / next.scale).toBeCloseTo((110 - 10) / 1);
        expect((120 - next.ty) / next.scale).toBeCloseTo((120 - 20) / 1);
    });

    it('clamps zoom to the scale limits without drifting the origin', () => {
        const atMax = zoomAt({ scale: MAX_SCALE, tx: 5, ty: 6 }, 3, 100, 100);
        expect(atMax).toEqual({ scale: MAX_SCALE, tx: 5, ty: 6 });
        expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0.001, 0, 0).scale).toBe(MIN_SCALE);
    });

    it('maps the wheel to zoom with a modifier and pan without', () => {
        const zoomIn = wheelIntent({ deltaX: 0, deltaY: -100, zoomModifier: true });
        const zoomOut = wheelIntent({ deltaX: 0, deltaY: 100, zoomModifier: true });
        expect(zoomIn.kind === 'zoom' && zoomIn.factor).toBeGreaterThan(1);
        expect(zoomOut.kind === 'zoom' && zoomOut.factor).toBeLessThan(1);
        expect(wheelIntent({ deltaX: 5, deltaY: -7, zoomModifier: false })).toEqual({ kind: 'pan', dx: -5, dy: 7 });
    });

    it('pans and tells a click from a pan', () => {
        expect(panBy({ scale: 2, tx: 1, ty: 2 }, 10, -5)).toEqual({ scale: 2, tx: 11, ty: -3 });
        expect(isPanGesture(1, 2)).toBe(false);
        expect(isPanGesture(2, 2)).toBe(true);
    });

    it('reveals a card only when it is outside the safe area, or always when centring', () => {
        const viewport = { left: 0, top: 0, right: 1000, bottom: 600 };
        expect(revealShift(viewport, { left: 100, top: 100, right: 200, bottom: 160 })).toBeNull();
        expect(revealShift(viewport, { left: 100, top: 100, right: 200, bottom: 200 }, true)).toEqual({
            dx: 350,
            dy: 150,
        });
        // Under the toolbar band (top < 56) counts as hidden.
        expect(revealShift(viewport, { left: 100, top: 20, right: 200, bottom: 80 })).not.toBeNull();
        expect(revealShift(viewport, { left: 950, top: 100, right: 1100, bottom: 160 })).toEqual({ dx: -525, dy: 170 });
    });
});

describe('dropZone', () => {
    const card = { left: 100, top: 200, right: 200, bottom: 300 };
    it('splits a card into thirds-ish bands along the layout axis', () => {
        expect(dropZone({ x: 110, y: 0 }, card, true)).toBe('before');
        expect(dropZone({ x: 150, y: 0 }, card, true)).toBe('child');
        expect(dropZone({ x: 190, y: 0 }, card, true)).toBe('after');
        expect(dropZone({ x: 0, y: 205 }, card, false)).toBe('before');
        expect(dropZone({ x: 0, y: 250 }, card, false)).toBe('child');
        expect(dropZone({ x: 0, y: 295 }, card, false)).toBe('after');
    });

    it('treats the quarter boundaries as child', () => {
        expect(dropZone({ x: 125, y: 0 }, card, true)).toBe('child');
        expect(dropZone({ x: 175, y: 0 }, card, true)).toBe('child');
    });
});

describe('itemKeyIntent', () => {
    it('walks the tree with the arrow keys', () => {
        expect(itemKeyIntent(key('ArrowDown'), 2, members, flat)).toEqual({ kind: 'focus', id: 4 });
        expect(itemKeyIntent(key('ArrowUp'), 3, members, flat)).toEqual({ kind: 'focus', id: 4 });
        expect(itemKeyIntent(key('ArrowRight'), 1, members, flat)).toEqual({ kind: 'focus', id: 2 });
        expect(itemKeyIntent(key('ArrowLeft'), 4, members, flat)).toEqual({ kind: 'focus', id: 2 });
        expect(itemKeyIntent(key('Home'), 3, members, flat)).toEqual({ kind: 'focus', id: 1 });
        expect(itemKeyIntent(key('End'), 1, members, flat)).toEqual({ kind: 'focus', id: 3 });
    });

    it('leaves the key alone at the edges of the tree', () => {
        expect(itemKeyIntent(key('ArrowUp'), 1, members, flat)).toBeNull();
        expect(itemKeyIntent(key('ArrowDown'), 3, members, flat)).toBeNull();
        expect(itemKeyIntent(key('ArrowRight'), 3, members, flat)).toBeNull();
        expect(itemKeyIntent(key('ArrowLeft'), 1, members, flat)).toBeNull();
    });

    it('maps action keys', () => {
        expect(itemKeyIntent(key('Enter'), 1, members, flat)).toEqual({ kind: 'open' });
        expect(itemKeyIntent(key(' '), 1, members, flat)).toEqual({ kind: 'open' });
        expect(itemKeyIntent(key('F2'), 1, members, flat)).toEqual({ kind: 'rename' });
        expect(itemKeyIntent(key('Delete'), 1, members, flat)).toEqual({ kind: 'delete' });
        expect(itemKeyIntent(key('a'), 1, members, flat)).toBeNull();
    });

    it('turns Alt+arrows into structure moves and ignores other modifier chords', () => {
        expect(itemKeyIntent(key('ArrowUp', { altKey: true }), 3, members, flat)).toMatchObject({
            kind: 'move',
            move: 'up',
        });
        expect(itemKeyIntent(key('ArrowDown', { altKey: true }), 2, members, flat)).toMatchObject({
            kind: 'move',
            move: 'down',
        });
        expect(itemKeyIntent(key('ArrowLeft', { altKey: true }), 4, members, flat)).toMatchObject({
            kind: 'move',
            move: 'out',
        });
        expect(itemKeyIntent(key('ArrowRight', { altKey: true }), 3, members, flat)).toMatchObject({
            kind: 'move',
            move: 'in',
        });
        expect(itemKeyIntent(key('Enter', { altKey: true }), 1, members, flat)).toBeNull();
        expect(itemKeyIntent(key('ArrowUp', { altKey: true, ctrlKey: true }), 3, members, flat)).toBeNull();
        expect(itemKeyIntent(key('ArrowDown', { ctrlKey: true }), 1, members, flat)).toBeNull();
        expect(itemKeyIntent(key('Delete', { metaKey: true }), 1, members, flat)).toBeNull();
    });

    it('ignores unknown members', () => {
        expect(itemKeyIntent(key('Enter'), 99, members, flat)).toBeNull();
    });
});

describe('nextSearchMatch', () => {
    const matches = new Set([2, 3]);
    it('cycles through matches in reading order after the focused card', () => {
        expect(nextSearchMatch(flat, matches, null)).toBe(2);
        expect(nextSearchMatch(flat, matches, 2)).toBe(3);
        expect(nextSearchMatch(flat, matches, 3)).toBe(2);
        expect(nextSearchMatch(flat, matches, 4)).toBe(2);
    });

    it('returns null without matches', () => {
        expect(nextSearchMatch(flat, new Set(), 1)).toBeNull();
    });
});

describe('selection state', () => {
    it('selecting closes a draft', () => {
        const drafting = startCreate(initialUi, members, 1, null);
        expect(drafting.creating).not.toBeNull();
        expect(selectMember(drafting, 3)).toMatchObject({ creating: null, selectedId: 3 });
    });

    it('starts a draft at the next free order and issues a fresh nonce each time', () => {
        const first = startCreate(initialUi, members, 1, null);
        expect(first.creating).toMatchObject({ parentId: 1, afterId: null, order: 2 });
        const second = startCreate(first, members, 1, 2);
        expect(second.creating?.afterId).toBe(2);
        expect(second.creating!.nonce).not.toBe(first.creating!.nonce);
    });

    it('closing the inspector clears selection and draft', () => {
        expect(closeInspector(startCreate(selectMember(initialUi, 2), members, null, null))).toMatchObject({
            creating: null,
            selectedId: null,
        });
    });

    it('a click on empty canvas deselects unless it ended a pan or a draft is open', () => {
        const selected = selectMember(initialUi, 2);
        expect(canvasClick(selected, false).selectedId).toBeNull();
        expect(canvasClick(selected, true).selectedId).toBe(2);
        const drafting = startCreate(selected, members, 2, null);
        expect(canvasClick(drafting, false)).toBe(drafting);
    });

    it('creating a member selects it and leaves the draft', () => {
        expect(createdMember(startCreate(initialUi, members, null, null), 9)).toMatchObject({
            creating: null,
            selectedId: 9,
        });
    });

    it('slots a new peer after its anchor only while the proposed place is kept', () => {
        const context = startCreate(initialUi, members, 1, 2).creating;
        expect(peerAnchor(context, { parentId: 1, order: context!.order })).toBe(2);
        expect(peerAnchor(context, { parentId: 1, order: 7 })).toBeNull();
        expect(peerAnchor(context, { parentId: null, order: context!.order })).toBeNull();
        expect(peerAnchor(startCreate(initialUi, members, 1, null).creating, { parentId: 1, order: 2 })).toBeNull();
        expect(peerAnchor(null, { parentId: 1, order: 2 })).toBeNull();
    });

    it('moves the selection to the manager when the selected member is deleted', () => {
        const target = members[3];
        expect(afterDelete(selectMember(initialUi, 4), members, target).selectedId).toBe(2);
        expect(afterDelete(selectMember(initialUi, 1), members, members[0]).selectedId).toBeNull();
        expect(afterDelete(selectMember(initialUi, 3), members, target).selectedId).toBe(3);
        expect(afterDelete(selectMember(initialUi, 4), [members[0]], target).selectedId).toBeNull();
    });
});

describe('rename state', () => {
    it('starts with the current name and ignores unknown members', () => {
        expect(startRename(initialUi, members, 2)).toMatchObject({ renamingId: 2, renameValue: 'M2' });
        expect(startRename(initialUi, members, 99)).toBe(initialUi);
    });

    it('commits a changed, trimmed name', () => {
        const ui = setRenameValue(startRename(initialUi, members, 2), '  Ada  ');
        expect(commitRename(ui, members, 2)).toEqual({ ui: { ...ui, renamingId: null }, name: 'Ada' });
    });

    it('commits nothing for an empty or unchanged name, but still ends renaming', () => {
        const empty = setRenameValue(startRename(initialUi, members, 2), '   ');
        expect(commitRename(empty, members, 2)).toMatchObject({ name: null, ui: { renamingId: null } });
        const same = setRenameValue(startRename(initialUi, members, 2), ' M2 ');
        expect(commitRename(same, members, 2)).toMatchObject({ name: null, ui: { renamingId: null } });
    });

    it('does nothing when that member is not being renamed (blur after Escape or Enter)', () => {
        expect(commitRename(initialUi, members, 2)).toBeNull();
        expect(commitRename(startRename(initialUi, members, 2), members, 3)).toBeNull();
    });
});
