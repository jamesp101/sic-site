import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { POST_TYPES } from '@/lib/content-types';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { contentField } from '@/lib/server/content-field';
import { departmentForWrite, scopeDepartment, type Actor } from '@/lib/server/authz';
import { db } from '@/lib/server/db';
import { imageFile } from '@/lib/server/image-file';
import { uniqueSlug } from '@/lib/server/slug';
import { LIMITS, put, remove } from '@/lib/server/storage';

const dateString = z
    .string()
    .nullish()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Enter a valid date.');

const fields = {
    title: z.string().trim().min(1, 'The title is required.').max(255),
    slug: z.string().trim().max(255).nullish(),
    content: contentField({ required: true }),
    type: z.enum(POST_TYPES as [string, ...string[]], { error: 'Choose a valid post type.' }),
    startDate: dateString,
    endDate: dateString,
    departmentId: z.number().int().nullish(),
    isFeatured: z.boolean(),
};

type DateRange = { startDate?: string | null; endDate?: string | null };

const endAfterStart = {
    check: (value: DateRange) =>
        !value.startDate || !value.endDate || Date.parse(value.endDate) >= Date.parse(value.startDate),
    options: { path: ['endDate'], message: 'The end date must be on or after the start date.' },
};

async function resolveDepartment(actor: Actor, requested: number | null | undefined) {
    const departmentId = departmentForWrite(actor, requested);
    if (departmentId !== null) {
        const exists = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!exists) throw new ActionError({ code: 'BAD_REQUEST', message: 'The selected department does not exist.' });
    }
    return departmentId;
}

/** `slugify(slug ?? title)`; empty becomes `post`; `-1`, `-2`, … until unique (excluding the post itself). */
function resolveSlug(input: { slug?: string | null; title: string }, excludeId?: number) {
    return uniqueSlug(
        input.slug ? input.slug : input.title,
        async (slug) =>
            (await db.post.findFirst({
                where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
                select: { id: true },
            })) !== null,
    );
}

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);

export const posts = {
    create: defineAction({
        accept: 'form',
        input: z
            .object({ ...fields, highlightImage: imageFile(LIMITS.image).nullish() })
            .refine(endAfterStart.check, endAfterStart.options),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveDepartment(actor, input.departmentId);
                const slug = await resolveSlug(input);

                const highlightImagePath = input.highlightImage ? await put('posts', input.highlightImage) : null;
                try {
                    const post = await db.post.create({
                        data: {
                            title: input.title,
                            slug,
                            content: input.content,
                            type: input.type,
                            startDate: toDate(input.startDate),
                            endDate: toDate(input.endDate),
                            highlightImagePath,
                            departmentId,
                            userId: actor.id,
                            isFeatured: input.isFeatured,
                        },
                    });
                    flash(context, 'Post created successfully.');
                    return { id: post.id };
                } catch (error) {
                    await remove(highlightImagePath);
                    throw error;
                }
            }),
    }),

    update: defineAction({
        accept: 'form',
        input: z
            .object({ id: z.number().int(), ...fields, highlightImage: imageFile(LIMITS.image).nullish() })
            .refine(endAfterStart.check, endAfterStart.options),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const post = scopeDepartment(actor, await db.post.findUnique({ where: { id: input.id } }));
                const departmentId = await resolveDepartment(actor, input.departmentId);
                const slug = await resolveSlug(input, post.id);

                const newImage = input.highlightImage ? await put('posts', input.highlightImage) : null;
                try {
                    await db.post.update({
                        where: { id: post.id },
                        data: {
                            title: input.title,
                            slug,
                            content: input.content,
                            type: input.type,
                            startDate: toDate(input.startDate),
                            endDate: toDate(input.endDate),
                            departmentId,
                            isFeatured: input.isFeatured,
                            ...(newImage ? { highlightImagePath: newImage } : {}),
                        },
                    });
                } catch (error) {
                    await remove(newImage);
                    throw error;
                }
                if (newImage) await remove(post.highlightImagePath);

                flash(context, 'Post updated successfully.');
                return { id: post.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const post = scopeDepartment(actor, await db.post.findUnique({ where: { id } }));
                await db.post.delete({ where: { id: post.id } });
                await remove(post.highlightImagePath);
                flash(context, 'Post deleted successfully.');
                return { id };
            }),
    }),
};
