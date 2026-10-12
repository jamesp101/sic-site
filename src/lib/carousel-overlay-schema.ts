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
    type Layer,
} from './carousel-overlay';

const pct = z.number().min(0).max(100);
const span = z.number().min(1).max(100);
const base = {
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid layer id.'),
    x: pct,
    y: pct,
    rotation: z.number().min(-180).max(180).default(0),
    opacity: z.number().int().min(10).max(100).default(100),
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

const uniqueIds = (layers: Layer[]) => new Set(layers.map((layer) => layer.id)).size === layers.length;

export const overlaySchema = z.strictObject({
    v: z.literal(OVERLAY_VERSION),
    layers: z
        .array(layerSchema)
        .max(MAX_LAYERS, `A slide can have at most ${MAX_LAYERS} layers.`)
        .refine(uniqueIds, 'Layer ids must be unique.'),
});

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type OverlayResult = { ok: true; layers: Layer[] } | { ok: false; error: string };

/** Strict validation for writes: any unknown property, bad URL or oversize document is an error. */
export function parseOverlayStrict(raw: string): OverlayResult {
    if (raw.length > MAX_OVERLAY_JSON) return { ok: false, error: 'The slide design is too large.' };
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return { ok: false, error: 'The slide design is not valid JSON.' };
    }
    const parsed = overlaySchema.safeParse(data);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const layer = typeof issue?.path[1] === 'number' ? ` (layer ${issue.path[1] + 1})` : '';
        return { ok: false, error: `${issue?.message ?? 'The slide design is invalid.'}${layer}` };
    }
    return { ok: true, layers: parsed.data.layers.map(rounded) };
}

/**
 * Tolerant read for rendering: null means "no overlay, use the legacy title/subtitle/link".
 * Invalid layers are dropped; a document whose layers are all invalid counts as no overlay.
 */
export function parseOverlay(raw: string | null | undefined): Layer[] | null {
    if (!raw || raw.length > MAX_OVERLAY_JSON) return null;
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object') return null;
    const doc = data as { v?: unknown; layers?: unknown };
    if (doc.v !== OVERLAY_VERSION || !Array.isArray(doc.layers)) return null;

    const seen = new Set<string>();
    const layers: Layer[] = [];
    for (const candidate of doc.layers.slice(0, MAX_LAYERS)) {
        const parsed = layerSchema.safeParse(candidate);
        if (!parsed.success || seen.has(parsed.data.id)) continue;
        seen.add(parsed.data.id);
        layers.push(parsed.data);
    }
    return layers.length === 0 && doc.layers.length > 0 ? null : layers;
}
