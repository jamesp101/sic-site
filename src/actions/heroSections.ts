import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { searchTextOf } from '@/lib/blocks/content';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { contentField } from '@/lib/server/content-field';
import { db } from '@/lib/server/db';
import { departmentIdField, loadScoped, resolveWriteDepartment } from '@/lib/server/department-access';

const fields = {
    title: z.string().trim().max(255).nullish(),
    content: contentField({ required: true }),
    order: z.number({ error: 'The order must be a whole number.' }).int('The order must be a whole number.'),
    isActive: z.boolean(),
    departmentId: departmentIdField,
};

export const heroSections = {
    create: defineAction({
        input: z.object(fields),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
                const section = await db.heroSection.create({
                    data: {
                        title: input.title || null,
                        content: input.content,
                        searchText: searchTextOf(input.content),
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
                const section = await loadScoped(actor, 'heroSection', input.id);
                const departmentId = await resolveWriteDepartment(actor, input.departmentId);
                await db.heroSection.update({
                    where: { id: section.id },
                    data: {
                        title: input.title || null,
                        content: input.content,
                        searchText: searchTextOf(input.content),
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
                const section = await loadScoped(actor, 'heroSection', id);
                await db.heroSection.delete({ where: { id: section.id } });
                flash(context, 'Hero section deleted successfully.');
                return { id };
            }),
    }),
};
