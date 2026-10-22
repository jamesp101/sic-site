import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { auth } from '@/lib/server/auth';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { db } from '@/lib/server/db';
import { sendMail } from '@/lib/server/mail';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit';

const MIN_PASSWORD = 8;

/** Hash stored for the signed-in user's credential login (Better Auth account row, else the legacy users.password). */
async function credentialHash(userId: number): Promise<string | null> {
    const credential = await db.account.findFirst({ where: { userId, providerId: 'credential' } });
    if (credential?.password) return credential.password;
    const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
    return user?.password ?? null;
}

/** Verifies the signed-in user's current password; attempts are rate-limited per user. */
async function assertPassword(userId: number, password: string): Promise<void> {
    if (!(await consumeRateLimit(`password:${userId}`, RATE_LIMITS.password))) {
        throw new ActionError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many password attempts. Try again in 15 minutes.',
        });
    }
    const hash = await credentialHash(userId);
    if (!hash || !(await verifyPassword(hash, password))) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'The provided password was incorrect.' });
    }
}

export const account = {
    updateProfile: defineAction({
        input: z.object({
            name: z.string().trim().min(1, 'Name is required.').max(255),
            email: z.string().trim().toLowerCase().max(255).pipe(z.email('Enter a valid email address.')),
            /** Required only when the email address changes. */
            currentPassword: z.string().optional(),
        }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                const current = await db.user.findUniqueOrThrow({ where: { id: actor.id } });

                const taken = await db.user.findFirst({
                    where: { email: input.email, NOT: { id: actor.id } },
                    select: { id: true },
                });
                if (taken)
                    throw new ActionError({ code: 'CONFLICT', message: 'That email address is already in use.' });

                const emailChanged = input.email !== current.email.toLowerCase();
                // The email is the password-reset target: changing it must not be possible with a session alone.
                if (emailChanged) {
                    if (!input.currentPassword) {
                        throw new ActionError({
                            code: 'BAD_REQUEST',
                            message: 'Enter your current password to change your email address.',
                        });
                    }
                    await assertPassword(actor.id, input.currentPassword);
                }
                const currentSessionId = context.locals.session ? Number(context.locals.session.id) : null;
                await db.$transaction(async (tx) => {
                    await tx.user.update({
                        where: { id: actor.id },
                        data: {
                            name: input.name,
                            email: input.email,
                            ...(emailChanged ? { emailVerified: false, emailVerifiedAt: null } : {}),
                        },
                    });
                    if (!emailChanged) return;
                    // Sign out every other device; keep this one.
                    await tx.session.deleteMany({
                        where: {
                            userId: actor.id,
                            ...(currentSessionId === null ? {} : { NOT: { id: currentSessionId } }),
                        },
                    });
                });
                if (emailChanged) {
                    await sendMail({
                        to: current.email,
                        subject: 'Your San Isidro College email address was changed',
                        text: `The email address of your San Isidro College account was changed to ${input.email}.\n\nIf you did not make this change, contact the site administrator immediately.`,
                    });
                }
                flash(context, 'Profile updated.');
                return { emailChanged };
            }),
    }),

    changePassword: defineAction({
        input: z
            .object({
                currentPassword: z.string().min(1, 'Enter your current password.'),
                password: z
                    .string()
                    .min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters.`)
                    .max(128),
                passwordConfirmation: z.string(),
            })
            .refine((value) => value.password === value.passwordConfirmation, {
                message: 'The password confirmation does not match.',
                path: ['passwordConfirmation'],
            }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                await assertPassword(actor.id, input.currentPassword);

                const next = await hashPassword(input.password);
                const currentSessionId = context.locals.session ? Number(context.locals.session.id) : null;

                await db.$transaction(async (tx) => {
                    const updated = await tx.account.updateMany({
                        where: { userId: actor.id, providerId: 'credential' },
                        data: { password: next },
                    });
                    if (updated.count === 0) {
                        await tx.account.create({
                            data: {
                                userId: actor.id,
                                providerId: 'credential',
                                accountId: String(actor.id),
                                password: next,
                            },
                        });
                    }
                    await tx.user.update({ where: { id: actor.id }, data: { password: next } });
                    // Sign out every other device; keep this one.
                    await tx.session.deleteMany({
                        where: {
                            userId: actor.id,
                            ...(currentSessionId === null ? {} : { NOT: { id: currentSessionId } }),
                        },
                    });
                });

                flash(context, 'Password updated.');
                return { ok: true as const };
            }),
    }),

    deleteAccount: defineAction({
        input: z.object({ password: z.string().min(1, 'Enter your password to confirm.') }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                await assertPassword(actor.id, input.password);

                if (actor.role === 'superadmin') {
                    const others = await db.user.count({ where: { role: 'superadmin', NOT: { id: actor.id } } });
                    if (others === 0) {
                        throw new ActionError({
                            code: 'FORBIDDEN',
                            message: 'The last superadmin account cannot be deleted.',
                        });
                    }
                }

                await clearAuthCookies(context);
                await db.user.delete({ where: { id: actor.id } });
                return { redirect: '/' };
            }),
    }),

    confirmPassword: defineAction({
        input: z.object({ password: z.string().min(1, 'Enter your password.') }),
        handler: (input, context) =>
            guarded(async () => {
                const actor = actorOf(context);
                await assertPassword(actor.id, input.password);
                return { ok: true as const };
            }),
    }),
};

/** Signs out through Better Auth and mirrors its cookie-clearing Set-Cookie headers onto the action response. */
async function clearAuthCookies(context: ActionAPIContext): Promise<void> {
    const { headers } = await auth.api.signOut({ headers: context.request.headers, returnHeaders: true });
    for (const cookie of headers.getSetCookie()) {
        const name = cookie.slice(0, cookie.indexOf('=')).trim();
        if (name) context.cookies.delete(name, { path: '/' });
    }
}
