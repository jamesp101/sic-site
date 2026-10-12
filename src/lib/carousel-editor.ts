/**
 * Pure helpers for the slide designer: undo history, snapping, move/resize geometry,
 * z-order and slide ordering. No DOM, no Svelte, no `astro:*`, so it is unit-testable.
 * All geometry is in percent of the slide.
 */
import type { Layer } from './carousel-overlay';

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const MIN_SIZE = 2;
export const SNAP_THRESHOLD = 1.2;
export const NUDGE = 0.5;
export const NUDGE_BIG = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------------------
// Undo / redo (immutable)
// ---------------------------------------------------------------------------

export interface History<T> {
    past: T[];
    present: T;
    future: T[];
    /** Edits with the same key within COALESCE_MS replace the previous entry (typing, sliders). */
    key: string | null;
    at: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 800;

export function createHistory<T>(present: T): History<T> {
    return { past: [], present, future: [], key: null, at: 0 };
}

export function commit<T>(history: History<T>, next: T, key: string | null = null, now = Date.now()): History<T> {
    const coalesce = key !== null && key === history.key && now - history.at < COALESCE_MS && history.past.length > 0;
    const past = coalesce ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT);
    return { past, present: next, future: [], key, at: now };
}

export function undo<T>(history: History<T>): History<T> {
    if (history.past.length === 0) return history;
    const present = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future], key: null, at: 0 };
}

export function redo<T>(history: History<T>): History<T> {
    if (history.future.length === 0) return history;
    const [present, ...future] = history.future;
    return { past: [...history.past, history.present], present, future, key: null, at: 0 };
}

// ---------------------------------------------------------------------------
// Move + snap
// ---------------------------------------------------------------------------

export interface Guides {
    /** x positions (percent) of vertical guide lines */
    v: number[];
    /** y positions (percent) of horizontal guide lines */
    h: number[];
}

function snapAxis(
    start: number,
    size: number,
    targets: number[],
    threshold: number,
): { delta: number; guide: number | null } {
    // Compare the box's start, centre and end against every target line.
    const anchors = [start, start + size / 2, start + size];
    let best = { delta: 0, guide: null as number | null, distance: threshold + 1 };
    for (const anchor of anchors) {
        for (const target of targets) {
            const distance = Math.abs(target - anchor);
            if (distance <= threshold && distance < best.distance)
                best = { delta: target - anchor, guide: target, distance };
        }
    }
    return { delta: best.delta, guide: best.guide };
}

/** Moves `box` to (x, y), snapping to the slide edges/centre and to the edges/centres of `others`. */
export function snapMove(
    box: Box,
    others: Box[],
    threshold = SNAP_THRESHOLD,
): { x: number; y: number; guides: Guides } {
    const vTargets = [0, 50, 100];
    const hTargets = [0, 50, 100];
    for (const other of others) {
        vTargets.push(other.x, other.x + other.w / 2, other.x + other.w);
        hTargets.push(other.y, other.y + other.h / 2, other.y + other.h);
    }
    const sx = snapAxis(box.x, box.w, vTargets, threshold);
    const sy = snapAxis(box.y, box.h, hTargets, threshold);
    return {
        x: box.x + sx.delta,
        y: box.y + sy.delta,
        guides: { v: sx.guide === null ? [] : [sx.guide], h: sy.guide === null ? [] : [sy.guide] },
    };
}

/** Keeps a box fully inside the slide. */
export function clampToSlide(box: Box): Box {
    const w = clamp(box.w, 0, 100);
    const h = clamp(box.h, 0, 100);
    return { x: clamp(box.x, 0, 100 - w), y: clamp(box.y, 0, 100 - h), w, h };
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handles available per layer kind: text only changes its width; shapes and images resize freely. */
export const WIDTH_HANDLES: Handle[] = ['w', 'e'];

/**
 * Resizes `start` by a pointer delta (percent). `lockAspect` keeps the start ratio for corner handles
 * (`aspect` = w/h in percent units).
 */
export function resizeBox(
    start: Box,
    handle: Handle,
    dx: number,
    dy: number,
    options: { lockAspect?: boolean; aspect?: number } = {},
): Box {
    let { x, y, w, h } = start;
    const right = start.x + start.w;
    const bottom = start.y + start.h;

    if (handle.includes('e')) w = clamp(start.w + dx, MIN_SIZE, 100 - start.x);
    if (handle.includes('s')) h = clamp(start.h + dy, MIN_SIZE, 100 - start.y);
    if (handle.includes('w')) {
        x = clamp(start.x + dx, 0, right - MIN_SIZE);
        w = right - x;
    }
    if (handle.includes('n')) {
        y = clamp(start.y + dy, 0, bottom - MIN_SIZE);
        h = bottom - y;
    }

    if (options.lockAspect && handle.length === 2 && options.aspect && options.aspect > 0) {
        // Drive the height from the width, then re-anchor the opposite corner.
        const nextH = w / options.aspect;
        if (handle.includes('n')) y = bottom - nextH;
        h = nextH;
        if (y < 0 || y + h > 100) return start;
    }
    return { x, y, w, h };
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export type ZMove = 'forward' | 'backward' | 'front' | 'back';

/** Reorders the layer in the array (array order = z-order). */
export function moveLayer(layers: Layer[], id: string, move: ZMove): Layer[] {
    const from = layers.findIndex((layer) => layer.id === id);
    if (from < 0) return layers;
    const last = layers.length - 1;
    const to =
        move === 'forward'
            ? Math.min(last, from + 1)
            : move === 'backward'
              ? Math.max(0, from - 1)
              : move === 'front'
                ? last
                : 0;
    if (to === from) return layers;
    const next = layers.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/** Sets every item with `id` to `patch`, leaving the rest untouched (returns the same array when nothing changed). */
export function patchLayer(layers: Layer[], id: string, patch: Partial<Layer>): Layer[] {
    let changed = false;
    const next = layers.map((layer) => {
        if (layer.id !== id) return layer;
        changed = true;
        return { ...layer, ...patch } as Layer;
    });
    return changed ? next : layers;
}

/** Copy of a layer with a fresh id, offset a little so the duplicate is visible. */
export function duplicateLayer(layer: Layer, id: string): Layer {
    return { ...layer, id, x: Math.min(layer.x + 2, 98), y: Math.min(layer.y + 3, 98) };
}

// ---------------------------------------------------------------------------
// Slide ordering
// ---------------------------------------------------------------------------

/**
 * New `order` values for slides listed in their new sequence. Reuses the existing values (sorted) so slides
 * outside the reordered subset keep their relative position, forcing strictly increasing values so ties
 * (for example all zeros) become a real order.
 */
export function assignOrders(currentOrders: number[]): number[] {
    const sorted = [...currentOrders].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index++) sorted[index] = Math.max(sorted[index], sorted[index - 1] + 1);
    return sorted;
}
