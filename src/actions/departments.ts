import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { requireSuperAdmin, scopeDepartment, AuthzError } from '@/lib/server/authz';
import { imageFile } from '@/lib/server/image-file';
import { slugify, uniqueSlug } from '@/lib/server/slug';
import { LIMITS, put, remove } from '@/lib/server/storage';

const fields = {
    name: z.string({ error: 'The name is required.' }).trim().min(1, 'The name is required.').max(255),
    description: z.string().nullable().optional(),
    heroContent: z.string().nullable().optional(),
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

                const logoPath = input.logo ? await put('departments', input.logo) : null;
                try {
                    const department = await db.department.create({
                        data: {
                            name: input.name,
                            slug,
                            description: input.description ?? null,
                            heroContent: input.heroContent ?? null,
                            logoPath,
                        },
                    });
                    flash(context, 'Department created successfully.');
                    return { id: department.id };
                } catch (error) {
                    await remove(logoPath);
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
                const row = await db.department.findUnique({ where: { id: input.id } });
                scopeDepartment(actor, row && { ...row, departmentId: row.id });
                if (!row) throw new AuthzError('NOT_FOUND');

                const logoPath = input.logo ? await put('departments', input.logo) : row.logoPath;
                try {
                    await db.department.update({
                        where: { id: row.id },
                        data: {
                            name: input.name,
                            description: input.description ?? null,
                            heroContent: input.heroContent ?? null,
                            logoPath,
                        },
                    });
                } catch (error) {
                    if (input.logo) await remove(logoPath);
                    throw error;
                }
                if (input.logo) await remove(row.logoPath);

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
                        carouselItems: { select: { imagePath: true } },
                        posts: { select: { highlightImagePath: true } },
                        downloads: { select: { filePath: true } },
                    },
                });
                if (!row) throw new AuthzError('NOT_FOUND');

                await db.department.delete({ where: { id } });

                await Promise.all([
                    remove(row.logoPath),
                    ...row.members.map((member) => remove(member.imagePath)),
                    ...row.carouselItems.map((item) => remove(item.imagePath)),
                    ...row.posts.map((post) => remove(post.highlightImagePath)),
                    ...row.downloads.map((download) => remove(download.filePath)),
                ]);

                flash(context, 'Department deleted successfully.');
                return { id };
            }),
    }),
};
