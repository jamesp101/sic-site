import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, guarded } from '@/lib/server/action-guard';
import { AuthzError, scopeDepartment, type Actor } from '@/lib/server/authz';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, publicUrl, put, remove } from '@/lib/server/storage';
import { placementsError, reparentOnDelete, wouldCycle } from '@/lib/org-tree';

const fields = {
    departmentId: z.number().int(),
    name: z.string({ error: 'The name is required.' }).trim().min(1, 'The name is required.').max(255),
    role: z.string({ error: 'The role is required.' }).trim().min(1, 'The role is required.').max(255),
    parentId: z.number().int().nullable().optional(),
    order: z.number({ error: 'The order must be a number.' }).int(),
    image: imageFile(LIMITS.memberImage).optional(),
};

/** Parent must be in the same department and must not be the member itself or one of its descendants. */
async function assertValidParent(departmentId: number, parentId: number | null | undefined, memberId?: number) {
    if (parentId == null) return;
    const tree = await db.member.findMany({
        where: { departmentId },
        select: { id: true, parentId: true, order: true },
    });
    if (!tree.some((node) => node.id === parentId)) {
        throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The selected parent does not belong to this department.',
        });
    }
    if (memberId !== undefined && wouldCycle(tree, memberId, parentId)) {
        throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'A member cannot report to itself or to one of its own subordinates.',
        });
    }
}

async function departmentFor(actor: Actor, departmentId: number) {
    const department = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!department) throw new AuthzError('NOT_FOUND');
    scopeDepartment(actor, { departmentId: department.id });
    return department;
}

async function memberFor(actor: Actor, departmentId: number, id: number) {
    await departmentFor(actor, departmentId);
    const member = await db.member.findUnique({ where: { id } });
    if (!member || member.departmentId !== departmentId) throw new AuthzError('NOT_FOUND');
    return scopeDepartment(actor, member);
}

export const members = {
    create: defineAction({
        accept: 'form',
        input: z.object(fields),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                await departmentFor(actor, input.departmentId);
                await assertValidParent(input.departmentId, input.parentId);

                const imagePath = input.image ? await put('members', input.image) : null;
                try {
                    const member = await db.member.create({
                        data: {
                            name: input.name,
                            role: input.role,
                            departmentId: input.departmentId,
                            parentId: input.parentId ?? null,
                            order: input.order,
                            imagePath,
                        },
                    });
                    return { id: member.id, order: member.order, imageUrl: publicUrl(member.imagePath) };
                } catch (error) {
                    await remove(imagePath);
                    throw error;
                }
            }),
    }),

    update: defineAction({
        accept: 'form',
        input: z.object({ id: z.number().int(), ...fields }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const member = await memberFor(actor, input.departmentId, input.id);
                await assertValidParent(member.departmentId, input.parentId, member.id);

                const imagePath = input.image ? await put('members', input.image) : member.imagePath;
                try {
                    await db.member.update({
                        where: { id: member.id },
                        data: {
                            name: input.name,
                            role: input.role,
                            parentId: input.parentId ?? null,
                            order: input.order,
                            imagePath,
                        },
                    });
                } catch (error) {
                    if (input.image) await remove(imagePath);
                    throw error;
                }
                if (input.image) await remove(member.imagePath);

                return { id: member.id, order: input.order, imageUrl: publicUrl(imagePath) };
            }),
    }),

    /** Applies the listed parent/order placements of one department's members in a single transaction. */
    reorder: defineAction({
        input: z.object({
            departmentId: z.number().int(),
            placements: z
                .array(
                    z.object({
                        id: z.number().int(),
                        parentId: z.number().int().nullable(),
                        order: z.number().int().min(0),
                    }),
                )
                .min(1)
                .max(1000),
        }),
        handler: ({ departmentId, placements }, context) =>
            guarded(async () => {
                await departmentFor(actorOf(context), departmentId);
                await db.$transaction(async (tx) => {
                    const existing = await tx.member.findMany({
                        where: { departmentId },
                        select: { id: true, parentId: true, order: true },
                    });
                    const problem = placementsError(existing, placements);
                    if (problem) throw new ActionError({ code: 'BAD_REQUEST', message: problem });
                    for (const { id, parentId, order } of placements) {
                        await tx.member.update({ where: { id }, data: { parentId, order } });
                    }
                });
                return { count: placements.length };
            }),
    }),

    /** Deletes a member; their direct reports move up to the member's manager (or become top level). */
    delete: defineAction({
        input: z.object({ departmentId: z.number().int(), id: z.number().int() }),
        handler: ({ departmentId, id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const member = await memberFor(actor, departmentId, id);
                await db.$transaction(async (tx) => {
                    const existing = await tx.member.findMany({
                        where: { departmentId },
                        select: { id: true, parentId: true, order: true },
                    });
                    for (const { id: childId, parentId, order } of reparentOnDelete(existing, member.id)) {
                        await tx.member.update({ where: { id: childId }, data: { parentId, order } });
                    }
                    await tx.member.delete({ where: { id: member.id } });
                });
                await remove(member.imagePath);
                return { id };
            }),
    }),
};
