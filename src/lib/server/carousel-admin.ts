import type { CarouselItem } from '@/generated/prisma/client';
import type { Layer } from '@/lib/carousel-overlay';
import { parseOverlay } from '@/lib/carousel-overlay-schema';
import { db } from './db';
import { directBaseUrl, publicUrl, remove } from './storage';

/** Slide as the admin designer sees it. */
export interface DesignerSlide {
    id: number;
    imageUrl: string;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
    order: number;
    departmentId: number | null;
    showOnMain: boolean;
    /** null = legacy slide (title / subtitle / link only), converted to layers on first edit. */
    overlay: Layer[] | null;
}

export function toDesignerSlide(row: CarouselItem): DesignerSlide {
    return {
        id: row.id,
        imageUrl: publicUrl(row.imagePath) ?? '',
        title: row.title,
        subtitle: row.subtitle,
        linkUrl: row.linkUrl,
        order: row.order,
        departmentId: row.departmentId,
        showOnMain: row.showOnMain,
        overlay: parseOverlay(row.overlay),
    };
}

/** Image URLs referenced by the image layers of a stored overlay. */
export function overlayImageSrcs(raw: string | null | undefined): string[] {
    const layers = parseOverlay(raw) ?? [];
    return [...new Set(layers.flatMap((layer) => (layer.type === 'image' ? [layer.src] : [])))];
}

/** Storage key of a layer image uploaded under `carousels/`; null for anything else (never delete foreign files). */
export function ownedImageKey(src: string): string | null {
    const prefix = directBaseUrl ? `${directBaseUrl}/` : '/storage/';
    if (!src.startsWith(prefix)) return null;
    const key = src.slice(prefix.length);
    return /^carousels\/[A-Za-z0-9._-]+$/.test(key) ? key : null;
}

/**
 * Deletes layer images that no slide references any more (as layer or as slide photo).
 * Call after the row that referenced them was updated or deleted.
 */
export async function removeUnusedLayerImages(srcs: string[]): Promise<void> {
    for (const src of srcs) {
        const key = ownedImageKey(src);
        if (!key) continue;
        const used = await db.carouselItem.count({
            where: { OR: [{ overlay: { contains: src } }, { imagePath: key }] },
        });
        if (used === 0) await remove(key);
    }
}
