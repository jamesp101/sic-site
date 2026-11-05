import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { RequestError } from '@/lib/server/request-error';
import { assignOrders } from '@/lib/carousel-editor';
import { legacyFields, serializeOverlay } from '@/lib/carousel-overlay';
import { parseOverlayStrict } from '@/lib/carousel-overlay-schema';
import { db } from '@/lib/server/db';
import { actorOf, guarded } from '@/lib/server/action-guard';
import {
    claimSlideVideo,
    createSlide,
    deleteSlide,
    duplicateSlide,
    updateSlide,
    type SlideVideo,
} from '@/lib/server/carousel-admin';
import { departmentIdField, loadScoped, loadScopedMany, resolveWriteDepartment } from '@/lib/server/department-access';
import { imageFile } from '@/lib/server/image-file';
import { toDesignerSlide } from '@/lib/server/slides';
import { LIMITS } from '@/lib/server/storage';

const overlayField = z.string().max(60_000, 'The slide design is too large.');

/** Validates the designer document and derives the legacy title / subtitle / link columns from it. */
function overlayData(raw: string) {
    const result = parseOverlayStrict(raw);
    if (!result.ok) throw new RequestError('BAD_REQUEST', result.error);
    return { overlay: serializeOverlay(result.layers, result.mobile), ...legacyFields(result.layers) };
}

const videoField = z.string().max(500, 'The video link is too long.');

/** Validates the designer's `video` field (our upload or a YouTube link) and checks the slide may own that file. */
async function videoData(raw: string, slideId?: number): Promise<SlideVideo> {
    const result = await claimSlideVideo(raw, slideId);
    if (!result.ok) throw new RequestError('BAD_REQUEST', result.error);
    return result.video;
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
                const row = await createSlide({
                    content,
                    image: input.image,
                    video,
                    departmentId,
                    showOnMain: input.showOnMain,
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

                let video: SlideVideo | undefined;
                if (input.video !== undefined) video = await videoData(input.video, row.id);
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
                return { slide: toDesignerSlide(await duplicateSlide(row)) };
            }),
    }),

    /** Persists a new slide sequence (drag and drop). `ids` lists the reordered slides in their new order. */
    reorder: defineAction({
        input: z.object({ ids: z.array(z.number().int()).min(1).max(500) }),
        handler: ({ ids }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                if (new Set(ids).size !== ids.length)
                    throw new RequestError('BAD_REQUEST', 'Duplicate slides in the order.');
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
