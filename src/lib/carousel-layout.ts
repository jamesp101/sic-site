/**
 * Slide layout: the one place that defines how a Slide is framed and how a Layer is placed in it, for the public
 * Carousel and the designer preview alike.
 *
 * Facts CSS must repeat (media/container queries cannot read TypeScript) live in `src/styles/slide-layout.css`;
 * `carousel-layout.test.ts` fails when that file disagrees with the constants below or when any other source
 * file hard-codes them.
 */
import type { Box } from './carousel-editor';
import { TEXT_COLOR_CLASS, TYPE_SCALE, scaleKind, type ColorKey, type Layer } from './carousel-overlay';
import type { MobileBox } from './carousel-overlay-mobile';

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** Phones are everything narrower than Tailwind's `sm` (40rem), measured on the hero (container) or the viewport (media). */
export const PHONE_MAX_REM = 39.99;
/** Below this width the hero is shorter; from it up the hero takes its wide height. */
export const WIDE_MIN_REM = 48;

/** The phone frame is 4:5 (width : height). */
export const PHONE_FRAME = { w: 4, h: 5 } as const;
/** The desktop stage is 16:9; layer percentages are of this box. */
export const DESKTOP_FRAME = { w: 16, h: 9 } as const;

/** Tailwind aspect classes of the designer stage per layout (literal strings so Tailwind sees them). */
export const FRAME_ASPECT_CLASS = { desktop: 'aspect-video', phone: 'aspect-[4/5]' } as const;

/** Hero heights in px: `tall` is the home page, `short` a Department page; `base` below `WIDE_MIN_REM`, `wide` from it. */
export const HERO_HEIGHT = {
    tall: { base: 500, wide: 600 },
    short: { base: 400, wide: 450 },
} as const;

/**
 * Width (px) the hero photo is drawn at on a phone: `object-cover` fits the 16:9 image to the hero's height, so it
 * is wider than the screen. Keyed like `HERO_HEIGHT`.
 */
export const HERO_PHONE_IMAGE_WIDTH = {
    tall: Math.ceil((HERO_HEIGHT.tall.base * DESKTOP_FRAME.w) / DESKTOP_FRAME.h),
    short: Math.ceil((HERO_HEIGHT.short.base * DESKTOP_FRAME.w) / DESKTOP_FRAME.h),
} as const;

/** `sizes` for a hero photo: the phone width below the phone breakpoint, the viewport otherwise. */
export const heroImageSizes = (tall: boolean): string =>
    `(max-width: ${PHONE_MAX_REM}rem) ${HERO_PHONE_IMAGE_WIDTH[tall ? 'tall' : 'short']}px, 100vw`;

/** Screen width (px) the designer's "visible area" guide is drawn for. */
export const GUIDE_SCREEN_WIDTH = 1440;

/** Share (percent) of the 16:9 slide height still visible on a `GUIDE_SCREEN_WIDTH` wide screen on the home page. */
export const VISIBLE_BAND = (HERO_HEIGHT.tall.wide / ((GUIDE_SCREEN_WIDTH * DESKTOP_FRAME.h) / DESKTOP_FRAME.w)) * 100;
/** Percent of the slide height cropped away at the top and again at the bottom. */
export const CROP = (100 - VISIBLE_BAND) / 2;

// ---------------------------------------------------------------------------
// Layer presentation
// ---------------------------------------------------------------------------

/**
 * Where a Layer is drawn:
 * - `public`: the live Carousel; layers sit at their desktop box and switch to their phone box with container
 *   queries (see slide-layout.css).
 * - `desktop`: designer preview of the desktop layout.
 * - `phone`: designer preview of the phone layout (no container query, so the box is applied directly).
 */
export type SlideMode = 'public' | 'desktop' | 'phone';

/**
 * Text colours that disappear on the darkened photo of a phone frame. Layers stacked automatically on phones
 * switch these to white; hand-placed layers keep their colour.
 */
const DARK_ON_PHONE: readonly ColorKey[] = ['navy', 'navy-deep', 'foreground', 'surface'];

export interface LayerPresentation {
    /** Inline style: stacking, geometry, opacity, rotation, font size and the phone box custom properties. */
    style: string;
    /** `sl-m*` modifiers that make the public layer follow its phone box below `PHONE_MAX_REM`. */
    phoneClass: string;
    /** Text colour class for text, outline buttons (empty for images). */
    textColor: string;
    /** Marks a layer that is hidden on phones in the phone preview. */
    ghostClass: string;
}

function textColorFor(layer: Layer, box: MobileBox | null, mode: SlideMode): string {
    if (layer.type === 'image') return '';
    const base = TEXT_COLOR_CLASS[layer.color];
    if (!box?.auto || !DARK_ON_PHONE.includes(layer.color)) return base;
    if (mode === 'phone') return 'text-white';
    return mode === 'public' ? `${base} sl-onphoto` : base;
}

/** Style and classes of one Layer at stacking order `z` (1 = bottom) with its resolved phone `box`. */
export function layerPresentation(layer: Layer, z: number, box: MobileBox | null, mode: SlideMode): LayerPresentation {
    const phonePreview = mode === 'phone' && box !== null;
    const textColor = textColorFor(layer, box, mode);
    const parts = [`z-index:${z}`];

    if (phonePreview) {
        parts.push(`left:${box.x}%`, `top:${box.y}%`);
        if (!box.autoW) parts.push(`width:${box.w}%`);
        if (!box.autoH) parts.push(`height:${box.h}%`);
        if (box.fs !== null) parts.push(`--fs:${box.fs}`);
        // Hidden layers stay reachable in the designer as ghosts; automatic layers are always fully opaque.
        const opacity = box.hidden ? 0.3 : box.auto ? 1 : layer.opacity / 100;
        if (opacity < 1) parts.push(`opacity:${opacity}`);
        return {
            style: parts.join(';'),
            phoneClass: '',
            textColor,
            ghostClass: box.hidden ? 'outline-1 outline-dashed outline-white' : '',
        };
    }

    parts.push(`left:${layer.x}%`, `top:${layer.y}%`);
    if ('w' in layer) parts.push(`width:${layer.w}%`);
    if ('h' in layer) parts.push(`height:${layer.h}%`);
    if (layer.opacity < 100) parts.push(`opacity:${layer.opacity / 100}`);
    if (layer.rotation) parts.push(`transform:rotate(${layer.rotation}deg)`);
    const kind = scaleKind(layer);
    if (kind && 'size' in layer) parts.push(`--fs:${TYPE_SCALE[kind][layer.size]}`);

    let phoneClass = '';
    if (box && mode === 'public') {
        parts.push(`--mx:${box.x}%`, `--my:${box.y}%`, `--mw:${box.autoW ? 'auto' : `${box.w}%`}`);
        parts.push(`--mh:${box.autoH ? 'auto' : `${box.h}%`}`);
        if (box.fs !== null) parts.push(`--mfs:${box.fs}`);
        phoneClass = box.hidden ? 'sl-mhide' : `sl-m ${box.auto ? 'sl-mauto' : ''}`;
    }
    return { style: parts.join(';'), phoneClass, textColor, ghostClass: '' };
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

function boxIn(el: HTMLElement, width: number, height: number): Box {
    return {
        x: (el.offsetLeft / width) * 100,
        y: (el.offsetTop / height) * 100,
        w: (el.offsetWidth / width) * 100,
        h: (el.offsetHeight / height) * 100,
    };
}

/** Rendered box of one layer element in percent of its stage (its parent); null while the stage has no size. */
export function measureLayerBox(el: HTMLElement): Box | null {
    const stage = el.parentElement;
    if (!stage?.clientWidth || !stage.clientHeight) return null;
    return boxIn(el, stage.clientWidth, stage.clientHeight);
}

/** Rendered boxes of every layer in a stage (text height is automatic) by layer id; null while the stage has no size. */
export function measureLayerBoxes(stage: HTMLElement): Record<string, Box> | null {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return null;
    const boxes: Record<string, Box> = {};
    for (const el of stage.querySelectorAll<HTMLElement>('[data-layer-id]')) {
        boxes[el.dataset.layerId as string] = boxIn(el, width, height);
    }
    return boxes;
}
