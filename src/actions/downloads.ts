import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { departmentForWrite, scopeDepartment } from '@/lib/server/authz';
import { db } from '@/lib/server/db';
import { LIMITS, MB, put, remove } from '@/lib/server/storage';

const DEFAULT_DIRECTORY = 'General';

export const downloads = {
    create: defineAction({
        accept: 'form',
        input: z.object({
            fileName: z.string().trim().min(1, 'The display name is required.').max(255),
            file: z
                .instanceof(File, { error: 'Choose a file to upload.' })
                .refine((file) => file.size > 0, 'Choose a file to upload.')
                .refine(
                    (file) => file.size <= LIMITS.download,
                    `The file must not be larger than ${LIMITS.download / MB} MB.`,
                ),
            tags: z.string().nullish(),
            directory: z.string().trim().max(255).nullish(),
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

                const tags = (input.tags ?? '')
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean);

                const filePath = await put('downloads', input.file);
                try {
                    const download = await db.download.create({
                        data: {
                            fileName: input.fileName,
                            filePath,
                            fileSize: input.file.size,
                            tags: JSON.stringify(tags),
                            directory: input.directory || DEFAULT_DIRECTORY,
                            departmentId,
                            userId: actor.id,
                        },
                    });
                    flash(context, 'File uploaded successfully.');
                    return { id: download.id };
                } catch (error) {
                    await remove(filePath);
                    throw error;
                }
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const download = scopeDepartment(actor, await db.download.findUnique({ where: { id } }));
                await db.download.delete({ where: { id: download.id } });
                await remove(download.filePath);
                flash(context, 'File deleted successfully.');
                return { id };
            }),
    }),
};
