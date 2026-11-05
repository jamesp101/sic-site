import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { requireSuperAdmin } from '@/lib/server/authz';
import { assertValidParent } from '@/lib/server/nav-link-rules';
import { RequestError } from '@/lib/server/request-error';
import { navUrlError, reorderError } from '@/lib/nav-tree';

const fields = {
    label: z.string({ error: 'The label is required.' }).trim().min(1, 'The label is required.').max(255),
    url: z
        .string({ error: 'The URL is required.' })
        .trim()
        .min(1, 'The URL is required.')
        .max(255)
        .refine((value) => navUrlError(value) === null, {
            message: 'Use a path such as /posts or a full https:// URL.',
        }),
    order: z.number({ error: 'The order must be a number.' }).int(),
    isActive: z.boolean(),
    parentId: z.number().int().nullable().optional(),
};

export const navlinks = {
    create: defineAction({
        input: z.object(fields),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                await assertValidParent(input.parentId);
                const link = await db.navigationLink.create({
                    data: {
                        label: input.label,
                        url: input.url,
                        order: input.order,
                        isActive: input.isActive,
                        parentId: input.parentId ?? null,
                    },
                });
                flash(context, 'Navigation link created.');
                return { id: link.id };
            }),
    }),

    update: defineAction({
        input: z.object({ id: z.number().int(), ...fields }),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                const link = await db.navigationLink.findUnique({ where: { id: input.id }, select: { id: true } });
                if (!link) throw new RequestError('NOT_FOUND');
                await assertValidParent(input.parentId, link.id);
                await db.navigationLink.update({
                    where: { id: link.id },
                    data: {
                        label: input.label,
                        url: input.url,
                        order: input.order,
                        isActive: input.isActive,
                        parentId: input.parentId ?? null,
                    },
                });
                flash(context, 'Navigation link updated.');
                return { id: link.id };
            }),
    }),

    /** Applies the whole tree (parent + position of every listed link) in one transaction. */
    reorder: defineAction({
        input: z.object({
            items: z
                .array(
                    z.object({
                        id: z.number().int(),
                        parentId: z.number().int().nullable(),
                        order: z.number().int().min(0),
                    }),
                )
                .min(1)
                .max(500),
        }),
        handler: ({ items }, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                await db.$transaction(async (tx) => {
                    const existing = await tx.navigationLink.findMany({ select: { id: true, parentId: true } });
                    const problem = reorderError(items, existing);
                    if (problem) throw new RequestError('BAD_REQUEST', problem);
                    for (const item of items) {
                        await tx.navigationLink.update({
                            where: { id: item.id },
                            data: { parentId: item.parentId, order: item.order },
                        });
                    }
                });
                return { count: items.length };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                const link = await db.navigationLink.findUnique({ where: { id }, select: { id: true } });
                if (!link) throw new RequestError('NOT_FOUND');
                await db.navigationLink.delete({ where: { id } });
                flash(context, 'Navigation link deleted.');
                return { id };
            }),
    }),
};
