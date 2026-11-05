import { defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordTooShort } from '@/lib/password-policy';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { currentSessionId as currentSessionIdOf, signOut } from '@/lib/server/auth-session';
import { db } from '@/lib/server/db';
import { sendMail } from '@/lib/server/mail';
import { emailChangedMessage } from '@/lib/server/mail-messages';
import { hashPassword } from '@/lib/server/password';
import { assertPassword, endSessions, setPasswordLogin } from '@/lib/server/password-login';
import { RequestError } from '@/lib/server/request-error';
import { deleteUserWithFiles } from '@/lib/server/user-rules';

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
                if (taken) throw new RequestError('CONFLICT', 'That email address is already in use.');

                const emailChanged = input.email !== current.email.toLowerCase();
                // The email is the password-reset target: changing it must not be possible with a session alone.
                if (emailChanged) {
                    if (!input.currentPassword) {
                        throw new RequestError(
                            'BAD_REQUEST',
                            'Enter your current password to change your email address.',
                        );
                    }
                    await assertPassword(actor.id, input.currentPassword);
                }
                const currentSessionId = currentSessionIdOf(context.locals.session);
                await db.$transaction(async (tx) => {
                    await tx.user.update({
                        where: { id: actor.id },
                        data: {
                            name: input.name,
                            email: input.email,
                            ...(emailChanged ? { emailVerified: false, emailVerifiedAt: null } : {}),
                        },
                    });
                    // Sign out every other device; keep this one.
                    if (emailChanged) await endSessions(tx, actor.id, currentSessionId);
                });
                if (emailChanged) await sendMail(emailChangedMessage(current.email, input.email));
                flash(context, 'Profile updated.');
                return { emailChanged };
            }),
    }),

    changePassword: defineAction({
        input: z
            .object({
                currentPassword: z.string().min(1, 'Enter your current password.'),
                password: z.string().min(MIN_PASSWORD_LENGTH, passwordTooShort()).max(MAX_PASSWORD_LENGTH),
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
                const currentSessionId = currentSessionIdOf(context.locals.session);

                await db.$transaction((tx) =>
                    setPasswordLogin(tx, actor.id, next, { endSessions: { except: currentSessionId } }),
                );

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

                await deleteUserWithFiles(actor.id);
                // Only once the account is gone: a refused or failed delete keeps the user signed in.
                await clearAuthCookies(context);
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
    for (const name of await signOut(context.request.headers)) context.cookies.delete(name, { path: '/' });
}
