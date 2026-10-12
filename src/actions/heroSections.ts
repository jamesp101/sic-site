import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { departmentForWrite, scopeDepartment, type Actor } from '@/lib/server/authz';
import { db } from '@/lib/server/db';

const fields = {
    title: z.string().trim().max(255).nullish(),
    content: z.string().min(1, 'The content is required.'),
    order: z.number({ error: 'The order must be a whole number.' }).int('The order must be a whole number.'),
    isActive: z.boolean(),
    departmentId: z.number().int().nullish(),
};

async function resolveDepartment(actor: Actor, requested: number | null | undefined) {
    const departmentId = departmentForWrite(actor, requested);
    if (departmentId !== null) {
        const exists = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!exists) throw new ActionError({ code: 'BAD_REQUEST', message: 'The selected department does not exist.' });
    }
    return departmentId;
}

export const heroSections = {
    create: defineAction({
        input: z.object(fields),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveDepartment(actor, input.departmentId);
                const section = await db.heroSection.create({
                    data: {
                        title: input.title || null,
                        content: input.content,
                        order: input.order,
                        isActive: input.isActive,
                        departmentId,
                    },
                });
                flash(context, 'Hero section created successfully.');
                return { id: section.id };
            }),
    }),

    update: defineAction({
        input: z.object({ id: z.number().int(), ...fields }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const section = scopeDepartment(actor, await db.heroSection.findUnique({ where: { id: input.id } }));
                const departmentId = await resolveDepartment(actor, input.departmentId);
                await db.heroSection.update({
                    where: { id: section.id },
                    data: {
                        title: input.title || null,
                        content: input.content,
                        order: input.order,
                        isActive: input.isActive,
                        departmentId,
                    },
                });
                flash(context, 'Hero section updated successfully.');
                return { id: section.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const section = scopeDepartment(actor, await db.heroSection.findUnique({ where: { id } }));
                await db.heroSection.delete({ where: { id: section.id } });
                flash(context, 'Hero section deleted successfully.');
                return { id };
            }),
    }),
};
