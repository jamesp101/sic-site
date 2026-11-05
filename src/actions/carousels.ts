import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import path from 'node:path';
import { assignOrders } from '@/lib/carousel-editor';
import { legacyFields, serializeOverlay } from '@/lib/carousel-overlay';
import { parseOverlay } from '@/lib/carousel-overlay-schema';
import { parseOverlayStrict } from '@/lib/carousel-overlay-schema';
import { db } from '@/lib/server/db';
import { actorOf, guarded } from '@/lib/server/action-guard';
import { AuthzError, scopeDepartment } from '@/lib/server/authz';
import { overlayImageSrcs, ownedImageKey, toDesignerSlide, unusedLayerImageKeys } from '@/lib/server/carousel-admin';
import { loadScoped, resolveWriteDepartment } from '@/lib/server/department-access';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, publicUrl, read } from '@/lib/server/storage';
import { commitWithFiles, deleteWithFiles, type NewFile, type NewFiles } from '@/lib/server/stored-files';

const overlayField = z.string().max(60_000, 'The slide design is too large.');

/** Validates the designer document and derives the legacy title / subtitle / link columns from it. */
function overlayData(raw: string) {
    const result = parseOverlayStrict(raw);
    if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
    return { overlay: serializeOverlay(result.layers), ...legacyFields(result.layers) };
}

/** A copy of a stored object, to be stored under `carousels/`; null when the source is missing. */
async function copyOf(key: string): Promise<NewFile | null> {
    const stored = await read(key);
    if (!stored) return null;
    const bytes = await new Response(stored.body).arrayBuffer();
    return {
        prefix: 'carousels',
        file: new File([bytes], path.basename(key), { type: stored.contentType ?? 'application/octet-stream' }),
    };
}

export const carousels = {
    create: defineAction({
        accept: 'form',
        input: z.object({
            image: imageFile(LIMITS.image, 'slide'),
            overlay: overlayField.optional(),
            departmentId: z.number().int().nullable().optional(),
            showOnMain: z.boolean(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
                const content = input.overlay
                    ? overlayData(input.overlay)
                    : { overlay: null, title: null, subtitle: null, linkUrl: null };

                const last = await db.carouselItem.aggregate({ _max: { order: true } });
                const row = await commitWithFiles({
                    files: { image: { prefix: 'carousels', file: input.image } },
                    run: ({ image }) =>
                        db.carouselItem.create({
                            data: {
                                ...content,
                                order: (last._max.order ?? 0) + 1,
                                departmentId,
                                showOnMain: input.showOnMain,
                                imagePath: image,
                            },
                        }),
                });
                return { slide: toDesignerSlide(row) };
            }),
    }),

    /** Saves the design (and optionally a replacement image) of one slide. */
    update: defineAction({
        accept: 'form',
        input: z.object({
            id: z.number().int(),
            overlay: overlayField,
            image: imageFile(LIMITS.image, 'slide').optional(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = await loadScoped(actor, 'carouselItem', input.id);
                const content = overlayData(input.overlay);

                const kept = overlayImageSrcs(content.overlay);
                const droppedSrcs = overlayImageSrcs(row.overlay).filter((src) => !kept.includes(src));
                const saved = await commitWithFiles({
                    files: { image: input.image && { prefix: 'carousels', file: input.image } },
                    run: ({ image }) =>
                        db.carouselItem.update({
                            where: { id: row.id },
                            data: { ...content, imagePath: image ?? row.imagePath },
                        }),
                    stale: async () => [
                        input.image ? row.imagePath : null,
                        ...(await unusedLayerImageKeys(droppedSrcs)),
                    ],
                });
                return { slide: toDesignerSlide(saved) };
            }),
    }),

    /** Where a slide is shown: the main page and/or one department. Superadmins only may change the department. */
    placement: defineAction({
        input: z.object({
            id: z.number().int(),
            showOnMain: z.boolean().optional(),
            departmentId: z.number().int().nullable().optional(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = await loadScoped(actor, 'carouselItem', input.id);
                const departmentId =
                    input.departmentId === undefined
                        ? row.departmentId
                        : await resolveWriteDepartment(actor, input.departmentId);
                const saved = await db.carouselItem.update({
                    where: { id: row.id },
                    data: { departmentId, showOnMain: input.showOnMain ?? row.showOnMain },
                });
                return { slide: toDesignerSlide(saved) };
            }),
    }),

    /** Copies a slide (image file included) right after the original. */
    duplicate: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = await loadScoped(actor, 'carouselItem', id);

                // Layer images are copied too, so deleting one slide never breaks its duplicate.
                const files: NewFiles = { image: await copyOf(row.imagePath) };
                const layerCopies = new Map<string, string>();
                for (const [index, src] of overlayImageSrcs(row.overlay).entries()) {
                    const key = ownedImageKey(src);
                    if (!key) continue;
                    files[`layer${index}`] = await copyOf(key);
                    layerCopies.set(src, `layer${index}`);
                }
                const layers = parseOverlay(row.overlay);

                const created = await commitWithFiles({
                    files,
                    run: async (keys) => {
                        const overlay = layers
                            ? serializeOverlay(
                                  layers.map((layer) => {
                                      const copied =
                                          layer.type === 'image' ? keys[layerCopies.get(layer.src) ?? ''] : undefined;
                                      return layer.type === 'image' && copied
                                          ? { ...layer, src: publicUrl(copied) as string }
                                          : layer;
                                  }),
                              )
                            : row.overlay;
                        const [, copy] = await db.$transaction([
                            db.carouselItem.updateMany({
                                where: { order: { gt: row.order } },
                                data: { order: { increment: 1 } },
                            }),
                            db.carouselItem.create({
                                data: {
                                    title: row.title,
                                    subtitle: row.subtitle,
                                    linkUrl: row.linkUrl,
                                    overlay,
                                    order: row.order + 1,
                                    departmentId: row.departmentId,
                                    showOnMain: row.showOnMain,
                                    imagePath: keys.image ?? row.imagePath,
                                },
                            }),
                        ]);
                        return copy;
                    },
                });
                return { slide: toDesignerSlide(created) };
            }),
    }),

    /** Persists a new slide sequence (drag and drop). `ids` lists the reordered slides in their new order. */
    reorder: defineAction({
        input: z.object({ ids: z.array(z.number().int()).min(1).max(500) }),
        handler: ({ ids }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                if (new Set(ids).size !== ids.length)
                    throw new ActionError({ code: 'BAD_REQUEST', message: 'Duplicate slides in the order.' });
                const rows = await db.carouselItem.findMany({
                    where: { id: { in: ids } },
                    select: { id: true, order: true, departmentId: true },
                });
                if (rows.length !== ids.length) throw new AuthzError('NOT_FOUND');
                for (const row of rows) scopeDepartment(actor, row);

                const orders = assignOrders(rows.map((row) => row.order));
                await db.$transaction(
                    ids.map((id, index) => db.carouselItem.update({ where: { id }, data: { order: orders[index] } })),
                );
                return {
                    orders: Object.fromEntries(ids.map((id, index) => [id, orders[index]])) as Record<number, number>,
                };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = await loadScoped(actor, 'carouselItem', id);
                return deleteWithFiles(
                    async () => {
                        await db.carouselItem.delete({ where: { id: row.id } });
                        return { id };
                    },
                    async () => [row.imagePath, ...(await unusedLayerImageKeys(overlayImageSrcs(row.overlay)))],
                );
            }),
    }),
};
