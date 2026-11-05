import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { searchTextOf } from '@/lib/blocks/content';
import { POST_TYPES } from '@/lib/content-types';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { contentField } from '@/lib/server/content-field';
import { db } from '@/lib/server/db';
import { departmentIdField, loadScoped, resolveWriteDepartment } from '@/lib/server/department-access';
import { imageFile } from '@/lib/server/image-file';
import { uniqueSlug } from '@/lib/server/slug';
import { LIMITS } from '@/lib/server/storage';
import { commitWithFiles, deleteWithFiles } from '@/lib/server/stored-files';

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
    departmentId: departmentIdField,
    isFeatured: z.boolean(),
};

type DateRange = { startDate?: string | null; endDate?: string | null };

const endAfterStart = {
    check: (value: DateRange) =>
        !value.startDate || !value.endDate || Date.parse(value.endDate) >= Date.parse(value.startDate),
    options: { path: ['endDate'], message: 'The end date must be on or after the start date.' },
};

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
            .object({ ...fields, highlightImage: imageFile(LIMITS.image, 'highlight').nullish() })
            .refine(endAfterStart.check, endAfterStart.options),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
                const slug = await resolveSlug(input);

                const post = await commitWithFiles({
                    files: {
                        highlight: input.highlightImage && {
                            prefix: 'posts',
                            file: input.highlightImage,
                            variant: true,
                        },
                    },
                    run: ({ highlight }) =>
                        db.post.create({
                            data: {
                                title: input.title,
                                slug,
                                content: input.content,
                                searchText: searchTextOf(input.content),
                                type: input.type,
                                startDate: toDate(input.startDate),
                                endDate: toDate(input.endDate),
                                highlightImagePath: highlight ?? null,
                                departmentId,
                                userId: actor.id,
                                isFeatured: input.isFeatured,
                            },
                        }),
                });
                flash(context, 'Post created successfully.');
                return { id: post.id };
            }),
    }),

    update: defineAction({
        accept: 'form',
        input: z
            .object({ id: z.number().int(), ...fields, highlightImage: imageFile(LIMITS.image, 'highlight').nullish() })
            .refine(endAfterStart.check, endAfterStart.options),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const post = await loadScoped(actor, 'post', input.id);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
                const slug = await resolveSlug(input, post.id);

                await commitWithFiles({
                    files: {
                        highlight: input.highlightImage && {
                            prefix: 'posts',
                            file: input.highlightImage,
                            variant: true,
                        },
                    },
                    run: ({ highlight }) =>
                        db.post.update({
                            where: { id: post.id },
                            data: {
                                title: input.title,
                                slug,
                                content: input.content,
                                searchText: searchTextOf(input.content),
                                type: input.type,
                                startDate: toDate(input.startDate),
                                endDate: toDate(input.endDate),
                                departmentId,
                                isFeatured: input.isFeatured,
                                ...(highlight ? { highlightImagePath: highlight } : {}),
                            },
                        }),
                    stale: [input.highlightImage ? post.highlightImagePath : null],
                });

                flash(context, 'Post updated successfully.');
                return { id: post.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const post = await loadScoped(actor, 'post', id);
                await deleteWithFiles(() => db.post.delete({ where: { id: post.id } }), [post.highlightImagePath]);
                flash(context, 'Post deleted successfully.');
                return { id };
            }),
    }),
};
