import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import path from 'node:path';
import { assignOrders } from '@/lib/carousel-editor';
import { legacyFields, serializeOverlay } from '@/lib/carousel-overlay';
import { parseOverlay } from '@/lib/carousel-overlay-schema';
import { parseOverlayStrict } from '@/lib/carousel-overlay-schema';
import { db } from '@/lib/server/db';
import { actorOf, guarded } from '@/lib/server/action-guard';
import { AuthzError, departmentForWrite, scopeDepartment, type Actor } from '@/lib/server/authz';
import { overlayImageSrcs, ownedImageKey, removeUnusedLayerImages, toDesignerSlide } from '@/lib/server/carousel-admin';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, publicUrl, put, read, remove } from '@/lib/server/storage';

const overlayField = z.string().max(60_000, 'The slide design is too large.');

/** Validates the designer document and derives the legacy title / subtitle / link columns from it. */
function overlayData(raw: string) {
    const result = parseOverlayStrict(raw);
    if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
    return { overlay: serializeOverlay(result.layers), ...legacyFields(result.layers) };
}

async function resolveDepartment(actor: Actor, requested: number | null | undefined) {
    const departmentId = departmentForWrite(actor, requested);
    if (departmentId !== null) {
        const exists = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!exists) throw new ActionError({ code: 'BAD_REQUEST', message: 'The selected department does not exist.' });
    }
    return departmentId;
}

/** Copies a stored object under `carousels/`; null when the source is missing. */
async function copyObject(key: string): Promise<string | null> {
    const stored = await read(key);
    if (!stored) return null;
    const bytes = await new Response(stored.body).arrayBuffer();
    return put(
        'carousels',
        new File([bytes], path.basename(key), { type: stored.contentType ?? 'application/octet-stream' }),
    );
}

export const carousels = {
    /** Uploads a logo / image for a layer. Stored under `carousels/` so it is cleaned up with the slide. */
    uploadImage: defineAction({
        accept: 'form',
        input: z.object({ image: imageFile(LIMITS.image) }),
        handler: ({ image }, context) =>
            guarded(async () => {
                actorOf(context);
                const key = await put('carousels', image);
                return { url: publicUrl(key) as string };
            }),
    }),

    create: defineAction({
        accept: 'form',
        input: z.object({
            image: imageFile(LIMITS.image),
            overlay: overlayField.optional(),
            departmentId: z.number().int().nullable().optional(),
            showOnMain: z.boolean(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveDepartment(actor, input.departmentId);
                const content = input.overlay
                    ? overlayData(input.overlay)
                    : { overlay: null, title: null, subtitle: null, linkUrl: null };

                const last = await db.carouselItem.aggregate({ _max: { order: true } });
                const imagePath = await put('carousels', input.image);
                try {
                    const row = await db.carouselItem.create({
                        data: {
                            ...content,
                            order: (last._max.order ?? 0) + 1,
                            departmentId,
                            showOnMain: input.showOnMain,
                            imagePath,
                        },
                    });
                    return { slide: toDesignerSlide(row) };
                } catch (error) {
                    await remove(imagePath);
                    throw error;
                }
            }),
    }),

    /** Saves the design (and optionally a replacement image) of one slide. */
    update: defineAction({
        accept: 'form',
        input: z.object({ id: z.number().int(), overlay: overlayField, image: imageFile(LIMITS.image).optional() }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = scopeDepartment(actor, await db.carouselItem.findUnique({ where: { id: input.id } }));
                const content = overlayData(input.overlay);

                const imagePath = input.image ? await put('carousels', input.image) : row.imagePath;
                try {
                    const saved = await db.carouselItem.update({
                        where: { id: row.id },
                        data: { ...content, imagePath },
                    });
                    if (input.image) await remove(row.imagePath);
                    const kept = overlayImageSrcs(content.overlay);
                    await removeUnusedLayerImages(overlayImageSrcs(row.overlay).filter((src) => !kept.includes(src)));
                    return { slide: toDesignerSlide(saved) };
                } catch (error) {
                    if (input.image) await remove(imagePath);
                    throw error;
                }
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
                const row = scopeDepartment(actor, await db.carouselItem.findUnique({ where: { id: input.id } }));
                const departmentId =
                    input.departmentId === undefined
                        ? row.departmentId
                        : await resolveDepartment(actor, input.departmentId);
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
                const row = scopeDepartment(actor, await db.carouselItem.findUnique({ where: { id } }));

                let imagePath = row.imagePath;
                const copies: string[] = [];
                const copyKey = await copyObject(row.imagePath);
                if (copyKey) {
                    imagePath = copyKey;
                    copies.push(copyKey);
                }
                // Layer images are copied too, so deleting one slide never breaks its duplicate.
                let overlay = row.overlay;
                const layers = parseOverlay(row.overlay);
                if (layers) {
                    const mapped = new Map<string, string>();
                    for (const src of overlayImageSrcs(row.overlay)) {
                        const key = ownedImageKey(src);
                        const copied = key ? await copyObject(key) : null;
                        if (copied) {
                            copies.push(copied);
                            mapped.set(src, publicUrl(copied) as string);
                        }
                    }
                    overlay = serializeOverlay(
                        layers.map((layer) =>
                            layer.type === 'image' && mapped.has(layer.src)
                                ? { ...layer, src: mapped.get(layer.src) as string }
                                : layer,
                        ),
                    );
                }
                try {
                    const [, created] = await db.$transaction([
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
                                imagePath,
                            },
                        }),
                    ]);
                    return { slide: toDesignerSlide(created) };
                } catch (error) {
                    await Promise.all(copies.map((key) => remove(key)));
                    throw error;
                }
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
                const row = scopeDepartment(actor, await db.carouselItem.findUnique({ where: { id } }));
                await db.carouselItem.delete({ where: { id: row.id } });
                await remove(row.imagePath);
                await removeUnusedLayerImages(overlayImageSrcs(row.overlay));
                return { id };
            }),
    }),
};
