import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { departmentForWrite, scopeDepartment } from '@/lib/server/authz';
import { db } from '@/lib/server/db';
import { isDirectUploadKey } from '@/lib/server/direct-upload';
import { claimPendingUpload } from '@/lib/server/pending-uploads';
import { directUploads, headUpload, LIMITS, MB, put, remove } from '@/lib/server/storage';

const DEFAULT_DIRECTORY = 'General';

export const downloads = {
    create: defineAction({
        accept: 'form',
        input: z.object({
            fileName: z.string().trim().min(1, 'The display name is required.').max(255),
            // Multipart upload (local driver).
            file: z
                .instanceof(File, { error: 'Choose a file to upload.' })
                .refine((file) => file.size > 0, 'Choose a file to upload.')
                .refine(
                    (file) => file.size <= LIMITS.download,
                    `The file must not be larger than ${LIMITS.download / MB} MB.`,
                )
                .optional(),
            // Key of a file the browser already uploaded straight to the S3 bucket (`/api/admin/uploads/direct`).
            uploadedKey: z.string().trim().max(255).optional(),
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

                let filePath: string;
                let fileSize: number;
                if (input.uploadedKey) {
                    // Only an unclaimed key issued to this user by /api/admin/uploads/direct may be attached.
                    if (
                        !directUploads ||
                        !isDirectUploadKey(input.uploadedKey) ||
                        !(await claimPendingUpload(input.uploadedKey, actor.id))
                    ) {
                        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid uploaded file.' });
                    }
                    const uploaded = await headUpload(input.uploadedKey);
                    if (!uploaded)
                        throw new ActionError({
                            code: 'BAD_REQUEST',
                            message: 'The uploaded file was not found. Upload it again.',
                        });
                    filePath = input.uploadedKey;
                    fileSize = uploaded.size;
                    if (fileSize > LIMITS.download) {
                        await remove(filePath);
                        throw new ActionError({
                            code: 'BAD_REQUEST',
                            message: `The file must not be larger than ${LIMITS.download / MB} MB.`,
                        });
                    }
                } else {
                    if (!input.file)
                        throw new ActionError({ code: 'BAD_REQUEST', message: 'Choose a file to upload.' });
                    filePath = await put('downloads', input.file);
                    fileSize = input.file.size;
                }
                try {
                    const download = await db.download.create({
                        data: {
                            fileName: input.fileName,
                            filePath,
                            fileSize,
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
