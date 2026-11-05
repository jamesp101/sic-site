/**
 * Phone layout of a slide: the 4:5 frame, the phone type scale, per-layer overrides and the automatic
 * stacked layout for layers that have no hand-placed position. Pure (no DOM, no zod, no `astro:*`); the public
 * carousel, the designer canvas and the unit tests all call `resolveMobile`.
 *
 * Geometry is in percent of the 4:5 frame: x/w of its width, y/h of its height. The frame is 1.25 times as
 * tall as it is wide, so a length of `n` percent of the width is `n / 1.25` percent of the height.
 * Text heights cannot be measured here, so they are estimated from the text (see `footprint`); the estimate
 * errs on the tall side so stacked layers never touch.
 */
import {
    SIZES,
    readingOrder,
    scaleKind,
    type Layer,
    type MobileOverride,
    type ScaleKind,
    type Size,
    type SlideMobile,
} from './carousel-overlay';

/** Frame height as a multiple of its width (4:5). */
export const FRAME_H_PER_W = 1.25;
/** Side margin of auto-stacked layers, percent of the width. */
export const MOBILE_MARGIN = 6;
/** Free space kept above the stack (percent of the height). */
export const MOBILE_TOP = 6;
/** Free space kept below the stack for the carousel controls (percent of the height). */
export const MOBILE_BOTTOM = 14;
export const MOBILE_GAP = 2.5;
export const MOBILE_GAP_MIN = 1;
/** Logo height in the automatic layout (percent of the height) and its widest allowed width (of the width). */
export const MOBILE_LOGO_H = 10;
export const MOBILE_LOGO_MAX_W = 40;
/** 12 px on a 320 px wide phone: the smallest text size, in hundredths of the frame width. */
export const MIN_CQW = 3.75;

/** Phone type scale in hundredths of the frame width (cqw); every step is at least MIN_CQW. */
export const MOBILE_TYPE_SCALE: Record<ScaleKind, Record<Size, number>> = {
    heading: { sm: 6.6, md: 7.8, lg: 9.2 },
    subtitle: { sm: 4.4, md: 5.0, lg: 5.6 },
    body: { sm: 3.9, md: 4.3, lg: 4.8 },
    button: { sm: 3.8, md: 4.1, lg: 4.5 },
    badge: { sm: 3.75, md: 4.0, lg: 4.3 },
};

export interface MobileBox {
    x: number;
    y: number;
    /** Estimated for layers whose width is automatic (`autoW`). */
    w: number;
    /** Estimated for layers whose height is automatic (`autoH`). */
    h: number;
    autoW: boolean;
    autoH: boolean;
    /** Font size in cqw of the frame; null for panels and images. */
    fs: number | null;
    hidden: boolean;
    /** True when the position comes from the automatic layout rather than a hand-placed override. */
    auto: boolean;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const DEFAULT_FOCUS = { x: 50, y: 50 } as const;

export function slideFocus(mobile: SlideMobile | null | undefined): { x: number; y: number } {
    return mobile ? mobile.focus : DEFAULT_FOCUS;
}

/** One step smaller; the smallest step stays. */
export function stepDown(size: Size, steps = 1): Size {
    return SIZES[Math.max(0, SIZES.indexOf(size) - steps)];
}

/** The size step a layer uses on phones: its override, else the desktop step one notch down. Null without a size. */
export function mobileSize(layer: Layer): Size | null {
    if (!('size' in layer)) return null;
    return layer.mobile?.size ?? stepDown(layer.size);
}

export const isPlaced = (layer: Layer): boolean => layer.mobile?.x !== undefined && layer.mobile?.y !== undefined;

export function hasMobileOverride(layer: Layer): boolean {
    return !!layer.mobile && Object.values(layer.mobile).some((value) => value !== undefined);
}

/** Merges `patch` into the layer's mobile overrides; keys set to `undefined` are removed, an empty override disappears. */
export function setMobile(layer: Layer, patch: MobileOverride): Layer {
    const merged: Record<string, unknown> = { ...layer.mobile, ...patch };
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    const { mobile: _drop, ...rest } = layer;
    return Object.keys(merged).length ? ({ ...rest, mobile: merged } as Layer) : (rest as Layer);
}

export function resetMobile(layer: Layer): Layer {
    return setMobile(layer, {
        x: undefined,
        y: undefined,
        w: undefined,
        h: undefined,
        size: undefined,
        hidden: undefined,
    });
}

// ---------------------------------------------------------------------------
// Size estimates
// ---------------------------------------------------------------------------

const toHeight = (widthUnits: number) => widthUnits / FRAME_H_PER_W;
const AVERAGE_CHAR_EM = { heading: 0.58, other: 0.52 };
const LINE_HEIGHT = { heading: 1.25, other: 1.4 };

/** Lines a text needs when `capacity` characters fit in one line (greedy word wrap, long words break). */
export function countLines(text: string, capacity: number): number {
    const cap = Math.max(1, Math.floor(capacity));
    let lines = 0;
    for (const paragraph of text.split('\n')) {
        let used = 0;
        let count = 1;
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (word.length > cap) {
                // A word wider than a line starts a new line and breaks across as many as it needs.
                const broken = Math.ceil(word.length / cap);
                count += (used > 0 ? 1 : 0) + broken - 1;
                used = word.length - (broken - 1) * cap;
            } else if (used === 0) used = word.length;
            else if (used + 1 + word.length <= cap) used += 1 + word.length;
            else {
                count++;
                used = word.length;
            }
        }
        lines += count;
    }
    return lines;
}

const effective = (fs: number) => Math.max(MIN_CQW, fs);

/** Estimated width and height (percent of the frame) of a layer rendered at font size `fs` in a box `width` wide. */
function footprint(layer: Layer, fs: number | null, width: number): { w: number; h: number } {
    const f = effective(fs ?? MIN_CQW);
    switch (layer.type) {
        case 'text': {
            const heading = layer.role === 'heading';
            const em = width / f;
            const lines = countLines(layer.text, em / AVERAGE_CHAR_EM[heading ? 'heading' : 'other']);
            return { w: width, h: toHeight(lines * f * LINE_HEIGHT[heading ? 'heading' : 'other']) };
        }
        case 'button': {
            const em = Math.max(10, layer.label.length * 0.8 + 5.5);
            return { w: Math.min(100 - 2 * MOBILE_MARGIN, em * f), h: toHeight(3 * f) };
        }
        case 'badge':
            return { w: Math.min(100 - 2 * MOBILE_MARGIN, (layer.text.length * 0.72 + 1.8) * f), h: toHeight(1.8 * f) };
        case 'shape':
        case 'image':
            return { w: width, h: 0 };
    }
}

/** Aspect ratio (width / height in pixels) of a shape or image layer on the 16:9 slide. */
const aspectOf = (layer: Layer & { w: number; h: number }) => (layer.w * 16) / (layer.h * 9);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

interface Level {
    gap: number;
    /** Extra size steps down from the phone default. */
    down: number;
    /** Font scale below the smallest step (never under MIN_CQW). */
    scale: number;
}

/** Tried in order until the stack fits the frame: tighter spacing first, then smaller text. */
const LEVELS: Level[] = [
    { gap: MOBILE_GAP, down: 0, scale: 1 },
    { gap: MOBILE_GAP_MIN, down: 0, scale: 1 },
    { gap: MOBILE_GAP_MIN, down: 1, scale: 1 },
    { gap: MOBILE_GAP_MIN, down: 1, scale: 0.92 },
    { gap: MOBILE_GAP_MIN, down: 1, scale: 0.84 },
    { gap: MOBILE_GAP_MIN, down: 1, scale: 0.76 },
];

function fontOf(layer: Layer, size: Size | null, level: Level): number | null {
    const kind = scaleKind(layer);
    if (!kind || !size) return null;
    const step = stepDown(size, level.down);
    return Math.max(MIN_CQW, MOBILE_TYPE_SCALE[kind][step] * level.scale);
}

/**
 * Phone box of every layer, by id.
 *
 * - `hidden` layers are skipped.
 * - Layers with `mobile.x`/`mobile.y` keep exactly that box (`auto: false`).
 * - Every other layer is stacked automatically in reading order: full width inside the side margins (buttons,
 *   badges and logos at their own width), sizes one notch below the desktop step, gaps of `MOBILE_GAP`, the
 *   stack bottom-aligned above the carousel controls. If it does not fit, gaps shrink first, then sizes.
 *   Hand-placed layers are obstacles: a stacked layer that would touch one moves below it.
 * - Panels without a hand-placed box are skipped: they are desktop scrims and the photo gradient takes over.
 */
export function resolveMobile(layers: Layer[]): Map<string, MobileBox> {
    const result = new Map<string, MobileBox>();
    const obstacles: Rect[] = [];
    const pending: Layer[] = [];

    for (const { layer } of readingOrder(layers)) {
        const mobile = layer.mobile;
        const placed = isPlaced(layer);
        if (mobile?.hidden || (!placed && layer.type === 'shape')) {
            result.set(layer.id, {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                autoW: true,
                autoH: true,
                fs: null,
                hidden: true,
                auto: !placed,
            });
            continue;
        }
        if (!placed) {
            pending.push(layer);
            continue;
        }
        const x = mobile?.x ?? 0;
        const y = mobile?.y ?? 0;
        const size = mobileSize(layer);
        const fs = size ? effective(MOBILE_TYPE_SCALE[scaleKind(layer) as ScaleKind][size]) : null;
        const fixedW = layer.type === 'text' || layer.type === 'shape' || layer.type === 'image';
        const fixedH = layer.type === 'shape' || layer.type === 'image';
        const width = mobile?.w ?? (layer.type === 'text' ? 100 - 2 * MOBILE_MARGIN : 'w' in layer ? layer.w : 0);
        const estimate = footprint(layer, fs, width);
        const w = fixedW ? width : estimate.w;
        const h = fixedH ? (mobile?.h ?? ('h' in layer ? layer.h : 0)) : estimate.h;
        const box: MobileBox = { x, y, w, h, autoW: !fixedW, autoH: !fixedH, fs, hidden: false, auto: false };
        result.set(layer.id, box);
        obstacles.push({ x, y, w, h });
    }

    if (pending.length === 0) return result;

    let best: Map<string, MobileBox> | null = null;
    for (const level of LEVELS) {
        const attempt = stack(pending, obstacles, level);
        best = attempt.boxes;
        if (attempt.fits) break;
    }
    for (const [id, box] of best ?? []) result.set(id, box);
    return result;
}

function stack(pending: Layer[], obstacles: Rect[], level: Level): { boxes: Map<string, MobileBox>; fits: boolean } {
    const width = 100 - 2 * MOBILE_MARGIN;
    const items = pending.map((layer) => {
        const fs = fontOf(layer, mobileSize(layer), level);
        if (layer.type === 'image') {
            const aspect = aspectOf(layer);
            const maxH = MOBILE_LOGO_H * Math.min(1, level.scale);
            const w = Math.min(MOBILE_LOGO_MAX_W, maxH * FRAME_H_PER_W * aspect);
            return { layer, fs, w, h: w / (FRAME_H_PER_W * aspect) };
        }
        const size = footprint(layer, fs, width);
        return { layer, fs, ...size };
    });

    const total = items.reduce((sum, item) => sum + item.h, 0) + level.gap * (items.length - 1);
    const limit = 100 - MOBILE_BOTTOM;
    let cursor = Math.max(MOBILE_TOP, limit - total);
    const boxes = new Map<string, MobileBox>();
    let bottom = 0;
    for (const item of items) {
        const rect: Rect = { x: MOBILE_MARGIN, y: cursor, w: item.w, h: item.h };
        // Hand-placed layers win: move below any that this one would touch (bounded: each push clears one).
        for (let pass = 0; pass <= obstacles.length; pass++) {
            const hit = obstacles.find((obstacle) => overlaps(rect, obstacle));
            if (!hit) break;
            rect.y = hit.y + hit.h + level.gap;
        }
        const { layer } = item;
        boxes.set(layer.id, {
            x: rect.x,
            y: rect.y,
            w: rect.w,
            h: rect.h,
            autoW: layer.type !== 'text' && layer.type !== 'image',
            autoH: layer.type !== 'image',
            fs: item.fs,
            hidden: false,
            auto: true,
        });
        cursor = rect.y + rect.h + level.gap;
        bottom = rect.y + rect.h;
    }
    return { boxes, fits: bottom <= limit + 0.01 };
}
