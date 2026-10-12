import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { AuthzError, scopeDepartment, type Actor } from '@/lib/server/authz';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, put, remove } from '@/lib/server/storage';

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
    const tree = await db.member.findMany({ where: { departmentId }, select: { id: true, parentId: true } });
    const parents = new Map(tree.map((node) => [node.id, node.parentId]));
    if (!parents.has(parentId)) {
        throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The selected parent does not belong to this department.',
        });
    }
    if (memberId === undefined) return;
    const seen = new Set<number>();
    for (let cursor: number | null | undefined = parentId; cursor != null; cursor = parents.get(cursor)) {
        if (cursor === memberId) {
            throw new ActionError({
                code: 'BAD_REQUEST',
                message: 'A member cannot report to itself or to one of its own subordinates.',
            });
        }
        if (seen.has(cursor)) break;
        seen.add(cursor);
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
                    flash(context, 'Member added to organization chart.');
                    return { id: member.id };
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

                flash(context, 'Member updated.');
                return { id: member.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ departmentId: z.number().int(), id: z.number().int() }),
        handler: ({ departmentId, id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const member = await memberFor(actor, departmentId, id);
                await db.member.delete({ where: { id: member.id } });
                await remove(member.imagePath);
                flash(context, 'Member removed.');
                return { id };
            }),
    }),
};
