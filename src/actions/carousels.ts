import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { departmentForWrite, scopeDepartment, type Actor } from '@/lib/server/authz';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, put, remove } from '@/lib/server/storage';

const fields = {
    title: z.string().trim().max(255).nullable().optional(),
    subtitle: z.string().trim().max(255).nullable().optional(),
    linkUrl: z.string().trim().max(255).nullable().optional(),
    order: z.number({ error: 'The order must be a number.' }).int(),
    departmentId: z.number().int().nullable().optional(),
    showOnMain: z.boolean(),
};

async function resolveDepartment(actor: Actor, requested: number | null | undefined) {
    const departmentId = departmentForWrite(actor, requested);
    if (departmentId !== null) {
        const exists = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!exists) throw new ActionError({ code: 'BAD_REQUEST', message: 'The selected department does not exist.' });
    }
    return departmentId;
}

export const carousels = {
    create: defineAction({
        accept: 'form',
        input: z.object({ ...fields, image: imageFile(LIMITS.image) }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveDepartment(actor, input.departmentId);

                const imagePath = await put('carousels', input.image);
                try {
                    const item = await db.carouselItem.create({
                        data: {
                            title: input.title || null,
                            subtitle: input.subtitle || null,
                            linkUrl: input.linkUrl || null,
                            order: input.order,
                            departmentId,
                            showOnMain: input.showOnMain,
                            imagePath,
                        },
                    });
                    flash(context, 'Carousel slide added.');
                    return { id: item.id };
                } catch (error) {
                    await remove(imagePath);
                    throw error;
                }
            }),
    }),

    update: defineAction({
        accept: 'form',
        input: z.object({ id: z.number().int(), ...fields, image: imageFile(LIMITS.image).optional() }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = scopeDepartment(actor, await db.carouselItem.findUnique({ where: { id: input.id } }));
                const departmentId = await resolveDepartment(actor, input.departmentId);

                const imagePath = input.image ? await put('carousels', input.image) : row.imagePath;
                try {
                    await db.carouselItem.update({
                        where: { id: row.id },
                        data: {
                            title: input.title || null,
                            subtitle: input.subtitle || null,
                            linkUrl: input.linkUrl || null,
                            order: input.order,
                            departmentId,
                            showOnMain: input.showOnMain,
                            imagePath,
                        },
                    });
                } catch (error) {
                    if (input.image) await remove(imagePath);
                    throw error;
                }
                if (input.image) await remove(row.imagePath);

                flash(context, 'Carousel slide updated.');
                return { id: row.id };
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
                flash(context, 'Carousel slide deleted.');
                return { id };
            }),
    }),
};
