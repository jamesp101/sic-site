import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { AuthzError, requireSuperAdmin } from '@/lib/server/authz';
import { hashPassword } from '@/lib/server/password';
import { remove } from '@/lib/server/storage';

const base = {
    name: z.string({ error: 'The name is required.' }).trim().min(1, 'The name is required.').max(255),
    email: z
        .email({ error: 'Enter a valid email address.' })
        .max(255)
        .transform((value) => value.trim().toLowerCase()),
    role: z.enum(['superadmin', 'department_user'], { error: 'Choose a role.' }),
    departmentId: z.number().int().nullable().optional(),
};

type Draft = { role: 'superadmin' | 'department_user'; departmentId?: number | null };

/** Department users must belong to a department; superadmins never do. */
function requireDepartmentForRole(value: Draft, ctx: z.RefinementCtx) {
    if (value.role === 'department_user' && value.departmentId == null) {
        ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Choose a department for department users.' });
    }
}

async function resolveDepartment(value: Draft): Promise<number | null> {
    if (value.role !== 'department_user') return null;
    const department = await db.department.findUnique({
        where: { id: value.departmentId as number },
        select: { id: true },
    });
    if (!department) throw new ActionError({ code: 'BAD_REQUEST', message: 'The selected department does not exist.' });
    return department.id;
}

async function assertEmailFree(email: string, exceptId?: number) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== exceptId) {
        throw new ActionError({ code: 'CONFLICT', message: 'This email address is already in use.' });
    }
}

const password = z.string({ error: 'The password is required.' }).min(8, 'The password must be at least 8 characters.');

export const users = {
    create: defineAction({
        input: z.object({ ...base, password }).superRefine(requireDepartmentForRole),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                await assertEmailFree(input.email);
                const departmentId = await resolveDepartment(input);
                const hash = await hashPassword(input.password);

                const user = await db.$transaction(async (tx) => {
                    const created = await tx.user.create({
                        data: { name: input.name, email: input.email, role: input.role, departmentId, password: hash },
                    });
                    await tx.account.create({
                        data: {
                            userId: created.id,
                            accountId: String(created.id),
                            providerId: 'credential',
                            password: hash,
                        },
                    });
                    return created;
                });

                flash(context, 'User created successfully.');
                return { id: user.id };
            }),
    }),

    update: defineAction({
        input: z
            .object({ id: z.number().int(), ...base, password: password.nullable().optional() })
            .superRefine(requireDepartmentForRole),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                const existing = await db.user.findUnique({ where: { id: input.id }, select: { id: true } });
                if (!existing) throw new AuthzError('NOT_FOUND');
                await assertEmailFree(input.email, existing.id);
                const departmentId = await resolveDepartment(input);
                const hash = input.password ? await hashPassword(input.password) : null;

                await db.$transaction(async (tx) => {
                    await tx.user.update({
                        where: { id: existing.id },
                        data: {
                            name: input.name,
                            email: input.email,
                            role: input.role,
                            departmentId,
                            ...(hash ? { password: hash } : {}),
                        },
                    });
                    if (!hash) return;
                    const credential = await tx.account.findFirst({
                        where: { userId: existing.id, providerId: 'credential' },
                        select: { id: true },
                    });
                    if (credential) {
                        await tx.account.update({ where: { id: credential.id }, data: { password: hash } });
                    } else {
                        await tx.account.create({
                            data: {
                                userId: existing.id,
                                accountId: String(existing.id),
                                providerId: 'credential',
                                password: hash,
                            },
                        });
                    }
                });

                flash(context, 'User updated successfully.');
                return { id: existing.id };
            }),
    }),

    delete: defineAction({
        input: z.object({ id: z.number().int() }),
        handler: ({ id }, context) =>
            guarded(async () => {
                const actor = requireSuperAdmin(actorOf(context));
                if (id === actor.id) {
                    throw new ActionError({
                        code: 'BAD_REQUEST',
                        message: 'Cannot delete the currently signed-in user.',
                    });
                }
                const existing = await db.user.findUnique({
                    where: { id },
                    select: {
                        id: true,
                        posts: { select: { highlightImagePath: true } },
                        downloads: { select: { filePath: true } },
                    },
                });
                if (!existing) throw new AuthzError('NOT_FOUND');
                // Sessions and accounts are removed by the ON DELETE CASCADE relations.
                await db.user.delete({ where: { id } });
                await Promise.all([
                    ...existing.posts.map((post) => remove(post.highlightImagePath)),
                    ...existing.downloads.map((download) => remove(download.filePath)),
                ]);
                flash(context, 'User deleted successfully.');
                return { id };
            }),
    }),
};
