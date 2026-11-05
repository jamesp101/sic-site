import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { db } from '@/lib/server/db';
import { loadScoped, resolveWriteDepartment } from '@/lib/server/department-access';

export const directories = {
    create: defineAction({
        input: z.object({
            name: z.string().trim().min(1, 'The folder name is required.').max(255),
            departmentId: z.number().int().nullish(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
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
                const directory = await loadScoped(actor, 'downloadDirectory', id);
                await db.downloadDirectory.delete({ where: { id: directory.id } });
                flash(context, 'Folder deleted.');
                return { id };
            }),
    }),
};
