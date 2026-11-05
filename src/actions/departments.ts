import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { requireSuperAdmin, AuthzError } from '@/lib/server/authz';
import { contentField } from '@/lib/server/content-field';
import { loadOwnDepartment } from '@/lib/server/department-access';
import { imageFile } from '@/lib/server/image-file';
import { slugify, uniqueSlug } from '@/lib/server/slug';
import { LIMITS } from '@/lib/server/storage';
import { commitWithFiles, deleteWithFiles } from '@/lib/server/stored-files';

const fields = {
    name: z.string({ error: 'The name is required.' }).trim().min(1, 'The name is required.').max(255),
    description: z.string().nullable().optional(),
    heroContent: contentField({ required: false }).nullable().optional(),
    logo: imageFile(LIMITS.image, 'logo').optional(),
};

export const departments = {
    create: defineAction({
        accept: 'form',
        input: z.object(fields),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));

                const duplicate = await db.department.findFirst({ where: { name: input.name }, select: { id: true } });
                if (duplicate)
                    throw new ActionError({ code: 'CONFLICT', message: 'A department with this name already exists.' });

                const slug = await uniqueSlug(
                    slugify(input.name) || 'department',
                    async (candidate) =>
                        (await db.department.findUnique({ where: { slug: candidate }, select: { id: true } })) !== null,
                );

                const department = await commitWithFiles({
                    files: { logo: input.logo && { prefix: 'departments', file: input.logo } },
                    run: ({ logo }) =>
                        db.department.create({
                            data: {
                                name: input.name,
                                slug,
                                description: input.description ?? null,
                                heroContent: input.heroContent ?? null,
                                logoPath: logo ?? null,
                            },
                        }),
                });
                flash(context, 'Department created successfully.');
                return { id: department.id };
            }),
    }),

    update: defineAction({
        accept: 'form',
        input: z.object({ id: z.number().int(), ...fields }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const row = await loadOwnDepartment(actor, input.id);

                await commitWithFiles({
                    files: { logo: input.logo && { prefix: 'departments', file: input.logo } },
                    run: ({ logo }) =>
                        db.department.update({
                            where: { id: row.id },
                            data: {
                                name: input.name,
                                description: input.description ?? null,
                                heroContent: input.heroContent ?? null,
                                logoPath: logo ?? row.logoPath,
                            },
                        }),
                    stale: [input.logo ? row.logoPath : null],
                });

                flash(context, 'Department details updated.');
                return { id: row.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                const row = await db.department.findUnique({
                    where: { id },
                    include: {
                        members: { select: { imagePath: true } },
                        carouselItems: { select: { imagePath: true, videoPath: true } },
                        posts: { select: { highlightImagePath: true } },
                        downloads: { select: { filePath: true } },
                    },
                });
                if (!row) throw new AuthzError('NOT_FOUND');

                await deleteWithFiles(
                    () => db.department.delete({ where: { id } }),
                    [
                        row.logoPath,
                        ...row.members.map((member) => member.imagePath),
                        ...row.carouselItems.flatMap((item) => [item.imagePath, item.videoPath]),
                        ...row.posts.map((post) => post.highlightImagePath),
                        ...row.downloads.map((download) => download.filePath),
                    ],
                );

                flash(context, 'Department deleted successfully.');
                return { id };
            }),
    }),
};
