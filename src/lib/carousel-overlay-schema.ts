/**
 * Zod validation for the slide overlay document (server actions, admin and tests only; never import this
 * from public components). See carousel-overlay.ts for the format.
 */
import { z } from 'astro/zod';
import {
    ALIGNS,
    BUTTON_VARIANTS,
    COLORS,
    FONTS,
    MAX_LAYERS,
    MAX_OVERLAY_JSON,
    OVERLAY_VERSION,
    RADII,
    ROLES,
    SIZES,
    rounded,
    safeHref,
    safeImageSrc,
    legacyLayers,
    upgradeLayer,
    type Layer,
    type SlideMobile,
} from './carousel-overlay';

const pct = z.number().min(0).max(100);
const span = z.number().min(1).max(100);
/** Phone overrides: percent bounds, token sizes only; a position needs both x and y. */
const mobileOverride = z
    .strictObject({
        x: pct.optional(),
        y: pct.optional(),
        w: span.optional(),
        h: span.optional(),
        size: z.enum(SIZES).optional(),
        hidden: z.boolean().optional(),
    })
    .refine((mobile) => (mobile.x === undefined) === (mobile.y === undefined), 'Set both the phone X and Y position.');

const slideMobile = z.strictObject({ focus: z.strictObject({ x: pct, y: pct }) });

const base = {
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid layer id.'),
    x: pct,
    y: pct,
    rotation: z.number().min(-180).max(180).default(0),
    opacity: z.number().int().min(10).max(100).default(100),
    mobile: mobileOverride.optional(),
};
const href = z
    .string()
    .trim()
    .refine((value) => safeHref(value) !== null, 'Enter a path such as /posts, an https:// link, mailto: or tel:.');
const imageSrc = z
    .string()
    .trim()
    .refine((value) => safeImageSrc(value) !== null, 'The image URL is not allowed.');

const textLayer = z.strictObject({
    type: z.literal('text'),
    ...base,
    w: span,
    role: z.enum(ROLES),
    text: z.string().trim().min(1, 'Text layers cannot be empty.').max(500, 'Text is limited to 500 characters.'),
    size: z.enum(SIZES),
    align: z.enum(ALIGNS),
    color: z.enum(COLORS),
    font: z.enum(FONTS),
});

const buttonLayer = z.strictObject({
    type: z.literal('button'),
    ...base,
    label: z
        .string()
        .trim()
        .min(1, 'Button labels cannot be empty.')
        .max(80, 'Button labels are limited to 80 characters.'),
    href,
    variant: z.enum(BUTTON_VARIANTS),
    color: z.enum(COLORS),
    size: z.enum(SIZES),
});

const badgeLayer = z.strictObject({
    type: z.literal('badge'),
    ...base,
    text: z.string().trim().min(1, 'Badges cannot be empty.').max(80, 'Badges are limited to 80 characters.'),
    color: z.enum(COLORS),
    size: z.enum(SIZES),
});

const shapeLayer = z.strictObject({
    type: z.literal('shape'),
    ...base,
    w: span,
    h: span,
    color: z.enum(COLORS),
    radius: z.enum(RADII),
});

const imageLayer = z.strictObject({
    type: z.literal('image'),
    ...base,
    w: span,
    h: span,
    src: imageSrc,
    alt: z
        .string()
        .trim()
        .min(1, 'Describe the image (alt text is required).')
        .max(200, 'Alt text is limited to 200 characters.'),
    radius: z.enum(RADII),
});

export const layerSchema = z.discriminatedUnion('type', [textLayer, buttonLayer, badgeLayer, shapeLayer, imageLayer]);

/** Old stored sizes (xs…3xl) become the nearest current step before validation. */
function upgradeDocument(data: unknown): unknown {
    if (!data || typeof data !== 'object' || !Array.isArray((data as { layers?: unknown }).layers)) return data;
    return { ...data, layers: (data as { layers: unknown[] }).layers.map(upgradeLayer) };
}

const uniqueIds = (layers: Layer[]) => new Set(layers.map((layer) => layer.id)).size === layers.length;

export const overlaySchema = z.strictObject({
    v: z.literal(OVERLAY_VERSION),
    layers: z
        .array(layerSchema)
        .max(MAX_LAYERS, `A slide can have at most ${MAX_LAYERS} layers.`)
        .refine(uniqueIds, 'Layer ids must be unique.'),
    mobile: slideMobile.optional(),
});

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type OverlayResult = { ok: true; layers: Layer[]; mobile: SlideMobile | null } | { ok: false; error: string };

/** Strict validation for writes: any unknown property, bad URL or oversize document is an error. */
export function parseOverlayStrict(raw: string): OverlayResult {
    if (raw.length > MAX_OVERLAY_JSON) return { ok: false, error: 'The slide design is too large.' };
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return { ok: false, error: 'The slide design is not valid JSON.' };
    }
    const parsed = overlaySchema.safeParse(upgradeDocument(data));
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const layer = typeof issue?.path[1] === 'number' ? ` (layer ${issue.path[1] + 1})` : '';
        return { ok: false, error: `${issue?.message ?? 'The slide design is invalid.'}${layer}` };
    }
    return { ok: true, layers: parsed.data.layers.map(rounded), mobile: parsed.data.mobile ?? null };
}

export interface OverlayDocument {
    layers: Layer[];
    mobile: SlideMobile | null;
}

/**
 * Tolerant read for rendering: null means "no overlay" (see `slideDocument` for legacy Slides).
 * Invalid layers are dropped (a layer with only invalid phone overrides keeps its desktop design); a document whose
 * layers are all invalid counts as no overlay; invalid slide-level phone settings are ignored.
 */
export function parseOverlayDocument(raw: string | null | undefined): OverlayDocument | null {
    if (!raw || raw.length > MAX_OVERLAY_JSON) return null;
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object') return null;
    const doc = data as { v?: unknown; layers?: unknown; mobile?: unknown };
    if (doc.v !== OVERLAY_VERSION || !Array.isArray(doc.layers)) return null;

    const seen = new Set<string>();
    const layers: Layer[] = [];
    for (const candidate of doc.layers.slice(0, MAX_LAYERS)) {
        const upgraded = upgradeLayer(candidate);
        let parsed = layerSchema.safeParse(upgraded);
        if (!parsed.success && upgraded && typeof upgraded === 'object' && 'mobile' in upgraded) {
            const { mobile: _drop, ...desktop } = upgraded as Record<string, unknown>;
            parsed = layerSchema.safeParse(desktop);
        }
        if (!parsed.success || seen.has(parsed.data.id)) continue;
        seen.add(parsed.data.id);
        layers.push(parsed.data);
    }
    if (layers.length === 0 && doc.layers.length > 0) return null;
    const mobile = slideMobile.safeParse(doc.mobile);
    return { layers, mobile: mobile.success ? mobile.data : null };
}

/** The layers of a stored overlay (see parseOverlayDocument); null = no overlay. */
export function parseOverlay(raw: string | null | undefined): Layer[] | null {
    return parseOverlayDocument(raw)?.layers ?? null;
}

/**
 * The Slide read model: the Layers (and phone settings) of a stored Slide. A legacy Slide (no usable overlay,
 * only title / subtitle / link) is converted to Layers here, once, so the public Carousel and the designer
 * only ever see Layers.
 */
export function slideDocument(row: {
    overlay: string | null;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
}): OverlayDocument {
    return parseOverlayDocument(row.overlay) ?? { layers: legacyLayers(row), mobile: null };
}
