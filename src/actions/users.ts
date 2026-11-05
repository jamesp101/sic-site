import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { db } from '@/lib/server/db';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { requireSuperAdmin } from '@/lib/server/authz';
import { MIN_PASSWORD_LENGTH, passwordTooShort } from '@/lib/password-policy';
import { currentSessionId as currentSessionIdOf } from '@/lib/server/auth-session';
import { assertDepartmentExists, departmentIdField } from '@/lib/server/department-access';
import { hashPassword } from '@/lib/server/password';
import { endSessions, setPasswordLogin } from '@/lib/server/password-login';
import { RequestError } from '@/lib/server/request-error';
import { assertUserDemotable, deleteUserWithFiles, superadminTransaction } from '@/lib/server/user-rules';

const base = {
    name: z.string({ error: 'The name is required.' }).trim().min(1, 'The name is required.').max(255),
    email: z
        .email({ error: 'Enter a valid email address.' })
        .max(255)
        .transform((value) => value.trim().toLowerCase()),
    role: z.enum(['superadmin', 'department_user'], { error: 'Choose a role.' }),
    departmentId: departmentIdField,
};

type Draft = { role: 'superadmin' | 'department_user'; departmentId?: number | null };

/** Department users must belong to a department; superadmins never do. */
function requireDepartmentForRole(value: Draft, ctx: z.RefinementCtx) {
    if (value.role === 'department_user' && value.departmentId == null) {
        ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Choose a department for department users.' });
    }
}

/** Department to store for the role: only department users have one, and it must exist. */
async function departmentFor(value: Draft): Promise<number | null> {
    if (value.role !== 'department_user') return null;
    const departmentId = value.departmentId as number;
    await assertDepartmentExists(departmentId);
    return departmentId;
}

async function assertEmailFree(email: string, exceptId?: number) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== exceptId) throw new RequestError('CONFLICT', 'This email address is already in use.');
}

const password = z.string({ error: 'The password is required.' }).min(MIN_PASSWORD_LENGTH, passwordTooShort());

export const users = {
    create: defineAction({
        input: z.object({ ...base, password }).superRefine(requireDepartmentForRole),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                await assertEmailFree(input.email);
                const departmentId = await departmentFor(input);
                const hash = await hashPassword(input.password);

                const user = await db.$transaction(async (tx) => {
                    const created = await tx.user.create({
                        data: { name: input.name, email: input.email, role: input.role, departmentId },
                    });
                    await setPasswordLogin(tx, created.id, hash);
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
                const existing = await db.user.findUnique({
                    where: { id: input.id },
                    select: { id: true, email: true },
                });
                if (!existing) throw new RequestError('NOT_FOUND');
                await assertEmailFree(input.email, existing.id);
                const departmentId = await departmentFor(input);
                const hash = input.password ? await hashPassword(input.password) : null;
                const emailChanged = input.email !== existing.email.toLowerCase();
                // An admin resetting their own password or email keeps the session they are using.
                const keep = currentSessionIdOf(context.locals.session);

                await superadminTransaction(async (tx) => {
                    if (input.role !== 'superadmin') await assertUserDemotable(tx, existing.id);
                    await tx.user.update({
                        where: { id: existing.id },
                        data: { name: input.name, email: input.email, role: input.role, departmentId },
                    });
                    // A reset password must also end every session that may belong to whoever knew the old
                    // one; so must a new email address (the password-reset target).
                    if (hash) await setPasswordLogin(tx, existing.id, hash, { endSessions: { except: keep } });
                    else if (emailChanged) await endSessions(tx, existing.id, keep);
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
                    throw new RequestError('BAD_REQUEST', 'Cannot delete the currently signed-in user.');
                }
                await deleteUserWithFiles(id);
                flash(context, 'User deleted successfully.');
                return { id };
            }),
    }),
};
