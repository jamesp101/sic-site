import { describe, expect, test } from 'vite-plus/test';
import {
    assignOrders,
    clampToSlide,
    commit,
    createHistory,
    duplicateLayer,
    moveLayer,
    patchLayer,
    redo,
    resizeBox,
    snapMove,
    undo,
} from './carousel-editor';
import { defaultLayer, type Layer } from './carousel-overlay';

describe('history', () => {
    test('undo and redo walk the stack and a new commit clears redo', () => {
        let h = createHistory(0);
        h = commit(h, 1);
        h = commit(h, 2);
        h = undo(h);
        expect(h.present).toBe(1);
        h = redo(h);
        expect(h.present).toBe(2);
        h = undo(undo(h));
        expect(h.present).toBe(0);
        expect(undo(h)).toBe(h);
        h = commit(h, 9);
        expect(h.future).toEqual([]);
        expect(redo(h)).toBe(h);
    });

    test('same-key edits inside the window coalesce into one undo step', () => {
        let h = createHistory('a');
        h = commit(h, 'ab', 'text', 1000);
        h = commit(h, 'abc', 'text', 1200);
        expect(h.past).toEqual(['a']);
        h = commit(h, 'abcd', 'text', 5000);
        expect(h.past).toEqual(['a', 'abc']);
        expect(undo(undo(h)).present).toBe('a');
    });
});

describe('snapMove', () => {
    test('snaps box centre and edges to the slide guides', () => {
        const centred = snapMove({ x: 24.5, y: 10, w: 50, h: 10 }, []);
        expect(centred.x).toBeCloseTo(25);
        expect(centred.guides.v).toEqual([50]);
        const edge = snapMove({ x: 0.8, y: 99.2 - 10, w: 20, h: 10 }, []);
        expect(edge.x).toBe(0);
        expect(edge.guides.h).toEqual([100]);
    });

    test('snaps to other layers and leaves far boxes alone', () => {
        const snapped = snapMove({ x: 30.9, y: 20, w: 10, h: 10 }, [{ x: 10, y: 60, w: 21, h: 5 }]);
        expect(snapped.x).toBeCloseTo(31);
        const far = snapMove({ x: 12, y: 20, w: 10, h: 10 }, []);
        expect(far).toEqual({ x: 12, y: 20, guides: { v: [], h: [] } });
    });
});

describe('resizeBox', () => {
    const start = { x: 20, y: 20, w: 30, h: 20 };

    test('east/south grow, west/north move the origin and keep the opposite edge', () => {
        expect(resizeBox(start, 'e', 10, 0)).toEqual({ x: 20, y: 20, w: 40, h: 20 });
        expect(resizeBox(start, 'w', -5, 0)).toEqual({ x: 15, y: 20, w: 35, h: 20 });
        expect(resizeBox(start, 'n', 0, 5)).toEqual({ x: 20, y: 25, w: 30, h: 15 });
        expect(resizeBox(start, 'se', 5, 5)).toEqual({ x: 20, y: 20, w: 35, h: 25 });
    });

    test('never shrinks below the minimum or leaves the slide', () => {
        expect(resizeBox(start, 'e', -100, 0).w).toBe(2);
        expect(resizeBox(start, 'w', 100, 0)).toMatchObject({ x: 48, w: 2 });
        expect(resizeBox(start, 'e', 500, 0).w).toBe(80);
        expect(resizeBox(start, 'nw', -500, -500)).toMatchObject({ x: 0, y: 0 });
    });

    test('corner handles can keep the aspect ratio', () => {
        const box = resizeBox(start, 'se', 15, 0, { lockAspect: true, aspect: 30 / 20 });
        expect(box.w).toBe(45);
        expect(box.h).toBe(30);
    });
});

describe('layers', () => {
    const mk = (id: string): Layer => ({ ...defaultLayer('badge'), id });
    const ids = (layers: Layer[]) => layers.map((l) => l.id);

    test('z-order moves', () => {
        const layers = [mk('a'), mk('b'), mk('c')];
        expect(ids(moveLayer(layers, 'a', 'forward'))).toEqual(['b', 'a', 'c']);
        expect(ids(moveLayer(layers, 'c', 'backward'))).toEqual(['a', 'c', 'b']);
        expect(ids(moveLayer(layers, 'a', 'front'))).toEqual(['b', 'c', 'a']);
        expect(ids(moveLayer(layers, 'c', 'back'))).toEqual(['c', 'a', 'b']);
        expect(moveLayer(layers, 'c', 'front')).toBe(layers);
        expect(moveLayer(layers, 'zzz', 'front')).toBe(layers);
    });

    test('patch and duplicate', () => {
        const layers = [mk('a'), mk('b')];
        expect(patchLayer(layers, 'a', { x: 40 })[0].x).toBe(40);
        expect(patchLayer(layers, 'nope', { x: 1 })).toBe(layers);
        const copy = duplicateLayer(layers[0], 'c');
        expect(copy).toMatchObject({ id: 'c', x: layers[0].x + 2, y: layers[0].y + 3 });
        expect(clampToSlide({ x: 95, y: -3, w: 20, h: 10 })).toEqual({ x: 80, y: 0, w: 20, h: 10 });
    });
});

describe('assignOrders', () => {
    test('turns ties into a strict order and reuses existing values', () => {
        expect(assignOrders([0, 0, 0])).toEqual([0, 1, 2]);
        expect(assignOrders([5, 1, 9])).toEqual([1, 5, 9]);
        expect(assignOrders([3, 3, 4])).toEqual([3, 4, 5]);
        expect(assignOrders([])).toEqual([]);
    });
});
