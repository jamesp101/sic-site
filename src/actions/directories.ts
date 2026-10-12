import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { departmentForWrite, scopeDepartment } from '@/lib/server/authz';
import { db } from '@/lib/server/db';

export const directories = {
    create: defineAction({
        input: z.object({
            name: z.string().trim().min(1, 'The folder name is required.').max(255),
            departmentId: z.number().int().nullish(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = departmentForWrite(actor, input.departmentId);
                if (departmentId !== null) {
                    const exists = await db.department.findUnique({
                        where: { id: departmentId },
                        select: { id: true },
                    });
                    if (!exists)
                        throw new ActionError({
                            code: 'BAD_REQUEST',
                            message: 'The selected department does not exist.',
                        });
                }
                const directory = await db.downloadDirectory.create({ data: { name: input.name, departmentId } });
                flash(context, 'Folder created successfully.');
                return { id: directory.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const directory = scopeDepartment(actor, await db.downloadDirectory.findUnique({ where: { id } }));
                await db.downloadDirectory.delete({ where: { id: directory.id } });
                flash(context, 'Folder deleted.');
                return { id };
            }),
    }),
};
