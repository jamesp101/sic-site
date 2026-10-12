/**
 * Carousel slide overlay model: a versioned JSON document stored in `carousel_items.overlay`.
 *
 * `{ "v": 1, "layers": [Layer, ...] }`. Layer array order is the z-order (last = on top).
 * Positions and sizes are percentages of the 16:9 slide (x/w of its width, y/h of its height);
 * text sizes are named steps (see SIZE_CQW) so they scale with the slide.
 * Free of `astro:*` imports and of zod (validation lives in carousel-overlay-schema.ts) so the public
 * carousel bundle stays small and the module runs in the browser, on the server and in unit tests.
 */
export const OVERLAY_VERSION = 1;
export const MAX_LAYERS = 24;
export const MAX_OVERLAY_JSON = 40_000;

export const LAYER_TYPES = ['text', 'button', 'badge', 'shape', 'image'] as const;
export const ROLES = ['heading', 'subtitle', 'body'] as const;
export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;
export const COLORS = ['white', 'gold', 'navy', 'navy-deep', 'sky', 'foreground', 'surface'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;
export const FONTS = ['serif', 'sans'] as const;
export const RADII = ['none', 'sm', 'md', 'lg', 'full'] as const;
export const BUTTON_VARIANTS = ['solid', 'outline'] as const;

export type LayerType = (typeof LAYER_TYPES)[number];
export type Role = (typeof ROLES)[number];
export type Size = (typeof SIZES)[number];
export type ColorKey = (typeof COLORS)[number];
export type Align = (typeof ALIGNS)[number];
export type Font = (typeof FONTS)[number];
export type Radius = (typeof RADII)[number];
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

interface LayerBase {
    id: string;
    x: number;
    y: number;
    rotation: number;
    opacity: number;
}
export interface TextLayer extends LayerBase {
    type: 'text';
    w: number;
    role: Role;
    text: string;
    size: Size;
    align: Align;
    color: ColorKey;
    font: Font;
}
export interface ButtonLayer extends LayerBase {
    type: 'button';
    label: string;
    href: string;
    variant: ButtonVariant;
    color: ColorKey;
    size: Size;
}
export interface BadgeLayer extends LayerBase {
    type: 'badge';
    text: string;
    color: ColorKey;
    size: Size;
}
export interface ShapeLayer extends LayerBase {
    type: 'shape';
    w: number;
    h: number;
    color: ColorKey;
    radius: Radius;
}
export interface ImageLayer extends LayerBase {
    type: 'image';
    w: number;
    h: number;
    src: string;
    alt: string;
    radius: Radius;
}
export type Layer = TextLayer | ButtonLayer | BadgeLayer | ShapeLayer | ImageLayer;

/** Font size per step, in hundredths of the slide width (container query width units). */
export const SIZE_CQW: Record<Size, number> = {
    xs: 1.1,
    sm: 1.4,
    md: 1.8,
    lg: 2.4,
    xl: 3.4,
    '2xl': 4.6,
    '3xl': 6,
};

export const SIZE_LABEL: Record<Size, string> = {
    xs: 'Extra small',
    sm: 'Small',
    md: 'Medium',
    lg: 'Large',
    xl: 'Extra large',
    '2xl': 'Huge',
    '3xl': 'Display',
};

export const COLOR_LABEL: Record<ColorKey, string> = {
    white: 'White',
    gold: 'Gold',
    navy: 'Navy',
    'navy-deep': 'Deep navy',
    sky: 'Sky',
    foreground: 'Ink (theme text)',
    surface: 'Paper (theme surface)',
};

/*
 * Class maps are literal strings so Tailwind can see them. Dark text colours switch to white
 * in the stacked mobile layout (`@max-3xl/hero`), where the slide image is darkened by a gradient.
 */
export const TEXT_COLOR_CLASS: Record<ColorKey, string> = {
    white: 'text-white',
    gold: 'text-gold-300',
    navy: 'text-brand-800 @max-3xl/hero:text-white',
    'navy-deep': 'text-brand-950 @max-3xl/hero:text-white',
    sky: 'text-brand-100',
    foreground: 'text-foreground @max-3xl/hero:text-white',
    surface: 'text-surface @max-3xl/hero:text-white',
};

export const BG_COLOR_CLASS: Record<ColorKey, string> = {
    white: 'bg-white',
    gold: 'bg-gold-500',
    navy: 'bg-brand-800',
    'navy-deep': 'bg-brand-950',
    sky: 'bg-brand-100',
    foreground: 'bg-foreground',
    surface: 'bg-surface',
};

/** Readable text colour on top of each background colour (buttons and badges). */
export const ON_COLOR_CLASS: Record<ColorKey, string> = {
    white: 'text-brand-950',
    gold: 'text-brand-950',
    navy: 'text-white',
    'navy-deep': 'text-white',
    sky: 'text-brand-950',
    foreground: 'text-surface',
    surface: 'text-foreground',
};

export const BORDER_COLOR_CLASS: Record<ColorKey, string> = {
    white: 'border-white',
    gold: 'border-gold-300',
    navy: 'border-brand-800',
    'navy-deep': 'border-brand-950',
    sky: 'border-brand-100',
    foreground: 'border-foreground',
    surface: 'border-surface',
};

export const RADIUS_CLASS: Record<Radius, string> = {
    none: 'rounded-none',
    sm: 'rounded-md',
    md: 'rounded-xl',
    lg: 'rounded-3xl',
    full: 'rounded-full',
};

export const ALIGN_CLASS: Record<Align, string> = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
};

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0020\u007f-\u009f\\]/;

/**
 * Returns the URL when it is a same-site path (`/x`), a fragment (`#x`) or an http(s)/mailto/tel URL;
 * otherwise null (blocks `javascript:`, `data:`, protocol-relative `//host`, whitespace, backslashes).
 */
export function safeHref(value: string | null | undefined): string | null {
    const url = (value ?? '').trim();
    if (!url || url.length > 500 || UNSAFE_CHARS.test(url)) return null;
    if (url.startsWith('#')) return url;
    if (url.startsWith('/')) return url.startsWith('//') ? null : url;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? url : null;
    } catch {
        return null;
    }
}

/** Image source: a same-site path or an http(s) URL. */
export function safeImageSrc(value: string | null | undefined): string | null {
    const url = safeHref(value);
    if (!url || url.startsWith('#') || /^(mailto|tel):/i.test(url)) return null;
    return url;
}

/** `rel` for a link: external http(s) URLs never leak the opener or referrer. */
export function relFor(href: string): string | undefined {
    return /^https?:/i.test(href) ? 'noopener noreferrer' : undefined;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

const round = (value: number) => Math.round(value * 100) / 100;

/** Rounds geometry to two decimals so stored documents stay small and stable. */
export function rounded(layer: Layer): Layer {
    const next: Layer = { ...layer, x: round(layer.x), y: round(layer.y), rotation: round(layer.rotation) };
    if ('w' in next && typeof next.w === 'number') next.w = round(next.w);
    if ('h' in next && typeof next.h === 'number') next.h = round(next.h);
    return next;
}

export function serializeOverlay(layers: Layer[]): string {
    return JSON.stringify({ v: OVERLAY_VERSION, layers: layers.map(rounded) });
}

// ---------------------------------------------------------------------------
// Defaults, legacy conversion, derived values
// ---------------------------------------------------------------------------

export function newLayerId(): string {
    return `l${Math.random().toString(36).slice(2, 10)}`;
}

const common = { rotation: 0, opacity: 100 } as const;

export function defaultLayer(type: LayerType): Layer {
    const id = newLayerId();
    switch (type) {
        case 'text':
            return {
                type,
                id,
                ...common,
                x: 8,
                y: 36,
                w: 52,
                role: 'heading',
                text: 'Your headline',
                size: '2xl',
                align: 'left',
                color: 'white',
                font: 'serif',
            };
        case 'button':
            return {
                type,
                id,
                ...common,
                x: 8,
                y: 72,
                label: 'Learn more',
                href: '/',
                variant: 'solid',
                color: 'gold',
                size: 'sm',
            };
        case 'badge':
            return { type, id, ...common, x: 8, y: 26, text: 'New', color: 'gold', size: 'xs' };
        case 'shape':
            return { type, id, ...common, opacity: 55, x: 0, y: 0, w: 62, h: 100, color: 'navy-deep', radius: 'none' };
        case 'image':
            return { type, id, ...common, x: 8, y: 8, w: 12, h: 21, src: '/', alt: '', radius: 'none' };
    }
}

export const TYPE_LABEL: Record<LayerType, string> = {
    text: 'Text',
    button: 'Button',
    badge: 'Badge',
    shape: 'Panel',
    image: 'Logo / image',
};

export const ROLE_LABEL: Record<Role, string> = { heading: 'Heading', subtitle: 'Subtitle', body: 'Body text' };

/** Short human label for the layers list. */
export function layerLabel(layer: Layer): string {
    switch (layer.type) {
        case 'text':
            return layer.text.split('\n')[0].slice(0, 40);
        case 'button':
            return layer.label;
        case 'badge':
            return layer.text;
        case 'shape':
            return 'Panel';
        case 'image':
            return layer.alt || 'Image';
    }
}

/** Layers equivalent to the legacy title / subtitle / link fields, for the first edit of an old slide. */
export function legacyLayers(slide: {
    title?: string | null;
    subtitle?: string | null;
    linkUrl?: string | null;
}): Layer[] {
    const layers: Layer[] = [];
    const title = slide.title?.trim();
    const subtitle = slide.subtitle?.trim();
    const link = slide.linkUrl?.trim();
    if (title) {
        layers.push({ ...(defaultLayer('text') as TextLayer), x: 6, y: 30, w: 60, text: title.slice(0, 500) });
    }
    if (subtitle) {
        layers.push({
            ...(defaultLayer('text') as TextLayer),
            x: 6,
            y: title ? 56 : 36,
            w: 55,
            role: 'subtitle',
            text: subtitle.slice(0, 500),
            size: 'md',
            font: 'sans',
        });
    }
    if (link && safeHref(link)) {
        layers.push({ ...(defaultLayer('button') as ButtonLayer), x: 6, y: 74, label: 'Explore more', href: link });
    }
    return layers;
}

/** Legacy columns kept in sync from the layers (admin labels, fallbacks). */
export function legacyFields(layers: Layer[]): {
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
} {
    const text = (role: Role) =>
        layers.find((l): l is TextLayer => l.type === 'text' && l.role === role)?.text.slice(0, 255) ?? null;
    const button = layers.find((l): l is ButtonLayer => l.type === 'button');
    return { title: text('heading'), subtitle: text('subtitle'), linkUrl: button?.href.slice(0, 255) ?? null };
}

/**
 * DOM / reading order: top to bottom, then left to right. The array index stays the z-index,
 * so what a visitor sees is unchanged while screen readers and the stacked mobile layout follow the page.
 */
export function readingOrder(layers: Layer[]): { layer: Layer; z: number }[] {
    return layers
        .map((layer, z) => ({ layer, z: z + 1 }))
        .sort((a, b) => a.layer.y - b.layer.y || a.layer.x - b.layer.x || a.z - b.z);
}
