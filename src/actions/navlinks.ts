import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { AuthzError, requireSuperAdmin } from '@/lib/server/authz';

const fields = {
    label: z.string({ error: 'The label is required.' }).trim().min(1, 'The label is required.').max(255),
    url: z.string({ error: 'The URL is required.' }).trim().min(1, 'The URL is required.').max(255),
    order: z.number({ error: 'The order must be a number.' }).int(),
    isActive: z.boolean(),
    parentId: z.number().int().nullable().optional(),
};

/** Navigation is two levels deep: a parent must be an existing top-level link other than the link itself. */
async function assertValidParent(parentId: number | null | undefined, selfId?: number) {
    if (parentId == null) return;
    if (parentId === selfId)
        throw new ActionError({ code: 'BAD_REQUEST', message: 'A link cannot be its own parent.' });
    const parent = await db.navigationLink.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) throw new ActionError({ code: 'BAD_REQUEST', message: 'The selected parent link does not exist.' });
    if (parent.parentId !== null) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Only top-level links can be used as a parent.' });
    }
    if (selfId !== undefined && (await db.navigationLink.count({ where: { parentId: selfId } })) > 0) {
        throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'A link that has sub-links cannot become a sub-link itself.',
        });
    }
}

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
                if (!link) throw new AuthzError('NOT_FOUND');
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

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                const link = await db.navigationLink.findUnique({ where: { id }, select: { id: true } });
                if (!link) throw new AuthzError('NOT_FOUND');
                await db.navigationLink.delete({ where: { id } });
                flash(context, 'Navigation link deleted.');
                return { id };
            }),
    }),
};
