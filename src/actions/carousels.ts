import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import path from 'node:path';
import { assignOrders } from '@/lib/carousel-editor';
import { legacyFields, serializeOverlay } from '@/lib/carousel-overlay';
import { parseOverlayDocument, parseOverlayStrict } from '@/lib/carousel-overlay-schema';
import { db } from '@/lib/server/db';
import { actorOf, guarded } from '@/lib/server/action-guard';
import {
    deleteSlide,
    overlayImageSrcs,
    ownedImageKey,
    parseSlideVideo,
    toDesignerSlide,
    updateSlide,
    videoClaimError,
    type SlideVideo,
} from '@/lib/server/carousel-admin';
import { departmentIdField, loadScoped, loadScopedMany, resolveWriteDepartment } from '@/lib/server/department-access';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, publicUrl, read } from '@/lib/server/storage';
import { commitWithFiles, type NewFile, type NewFiles } from '@/lib/server/stored-files';

const overlayField = z.string().max(60_000, 'The slide design is too large.');

/** Validates the designer document and derives the legacy title / subtitle / link columns from it. */
function overlayData(raw: string) {
    const result = parseOverlayStrict(raw);
    if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
    return { overlay: serializeOverlay(result.layers, result.mobile), ...legacyFields(result.layers) };
}

const videoField = z.string().max(500, 'The video link is too long.');

/** Validates the designer's `video` field (our upload or a YouTube link) and checks the slide may own that file. */
async function videoData(raw: string, slideId?: number): Promise<SlideVideo> {
    const result = parseSlideVideo(raw);
    if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
    const { videoPath } = result.video;
    // A key the slide already owns is not a new claim.
    if (videoPath) {
        const current =
            slideId === undefined
                ? null
                : await db.carouselItem.findUnique({ where: { id: slideId }, select: { videoPath: true } });
        const error = current?.videoPath === videoPath ? null : await videoClaimError(videoPath, slideId);
        if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error });
    }
    return result.video;
}

/** A copy of a stored object, to be stored under `prefix`; null when the source is missing. */
async function copyOf(key: string, prefix: NewFile['prefix'] = 'carousels'): Promise<NewFile | null> {
    const stored = await read(key);
    if (!stored) return null;
    const bytes = await new Response(stored.body).arrayBuffer();
    return {
        prefix,
        file: new File([bytes], path.basename(key), { type: stored.contentType ?? 'application/octet-stream' }),
    };
}

export const carousels = {
    create: defineAction({
        accept: 'form',
        input: z.object({
            image: imageFile(LIMITS.image, 'slide'),
            overlay: overlayField.optional(),
            video: videoField.optional(),
            departmentId: departmentIdField,
            showOnMain: z.boolean(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
                const content = input.overlay
                    ? overlayData(input.overlay)
                    : { overlay: null, title: null, subtitle: null, linkUrl: null };

                const video = await videoData(input.video ?? '');
                const last = await db.carouselItem.aggregate({ _max: { order: true } });
                const row = await commitWithFiles({
                    files: { image: { prefix: 'carousels', file: input.image } },
                    adopted: [video.videoPath],
                    run: ({ image }) =>
                        db.carouselItem.create({
                            data: {
                                ...content,
                                ...video,
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
            /** '' removes the video; omitted keeps it. */
            video: videoField.optional(),
            image: imageFile(LIMITS.image, 'slide').optional(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = await loadScoped(actor, 'carouselItem', input.id);
                const content = overlayData(input.overlay);

                const video = input.video === undefined ? undefined : await videoData(input.video, row.id);
                const saved = await updateSlide(row, { content, image: input.image, video });
                return { slide: toDesignerSlide(saved) };
            }),
    }),

    /** Where a slide is shown: the main page and/or one department. Superadmins only may change the department. */
    placement: defineAction({
        input: z.object({
            id: z.number().int(),
            showOnMain: z.boolean().optional(),
            departmentId: departmentIdField,
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
                const files: NewFiles = {
                    image: await copyOf(row.imagePath),
                    // The video file is owned by its slide, so a duplicate gets its own copy.
                    video: row.videoPath ? await copyOf(row.videoPath, 'videos') : null,
                };
                const layerCopies = new Map<string, string>();
                for (const [index, src] of overlayImageSrcs(row.overlay).entries()) {
                    const key = ownedImageKey(src);
                    if (!key) continue;
                    files[`layer${index}`] = await copyOf(key);
                    layerCopies.set(src, `layer${index}`);
                }
                const doc = parseOverlayDocument(row.overlay);

                const created = await commitWithFiles({
                    files,
                    run: async (keys) => {
                        const overlay = doc
                            ? serializeOverlay(
                                  doc.layers.map((layer) => {
                                      const copied =
                                          layer.type === 'image' ? keys[layerCopies.get(layer.src) ?? ''] : undefined;
                                      return layer.type === 'image' && copied
                                          ? { ...layer, src: publicUrl(copied) as string }
                                          : layer;
                                  }),
                                  doc.mobile,
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
                                    videoPath: keys.video ?? null,
                                    videoUrl: row.videoUrl,
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
                const rows = await loadScopedMany(actor, 'carouselItem', ids);

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
                return deleteSlide(row);
            }),
    }),
};
