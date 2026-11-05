import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { db } from '@/lib/server/db';
import { departmentIdField, loadScoped, resolveWriteDepartment } from '@/lib/server/department-access';
import { acceptDownloadFile, downloadFile } from '@/lib/server/download-intake';
import { DEFAULT_DIRECTORY, encodeTags } from '@/lib/server/downloads';
import { commitWithFiles, deleteWithFiles } from '@/lib/server/stored-files';

export const downloads = {
    create: defineAction({
        accept: 'form',
        input: z.object({
            fileName: z.string().trim().min(1, 'The display name is required.').max(255),
            // Multipart upload (local driver).
            file: downloadFile.optional(),
            // Key of a file the browser already uploaded straight to the S3 bucket (`/api/admin/uploads/direct`).
            uploadedKey: z.string().trim().max(255).optional(),
            tags: z.string().nullish(),
            directoryName: z.string().trim().max(255).nullish(),
            departmentId: departmentIdField,
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);

                const { key, size } = await acceptDownloadFile(actor.id, input);
                const download = await commitWithFiles({
                    adopted: [key],
                    run: () =>
                        db.download.create({
                            data: {
                                fileName: input.fileName,
                                filePath: key,
                                fileSize: size,
                                tags: encodeTags(input.tags),
                                directory: input.directoryName || DEFAULT_DIRECTORY,
                                departmentId,
                                userId: actor.id,
                            },
                        }),
                });
                flash(context, 'File uploaded successfully.');
                return { id: download.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const download = await loadScoped(actor, 'download', id);
                await deleteWithFiles(() => db.download.delete({ where: { id: download.id } }), [download.filePath]);
                flash(context, 'File deleted successfully.');
                return { id };
            }),
    }),
};
