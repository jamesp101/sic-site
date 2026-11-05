/**
 * A User's password login: the `credential` Account row Better Auth verifies at sign-in, with the hash
 * mirrored into `users.password` (the legacy Laravel column). Everything that sets, replaces or checks
 * that credential goes through here. Free of `astro:*` imports.
 */
import type { Prisma } from '../../generated/prisma/client';
import { db } from './db';
import { verifyPassword } from './password';
import { consumeRateLimit, RATE_LIMITS } from './rate-limit';
import { RequestError } from './request-error';

/** `db` or a transaction client, so a caller can set the login in the same transaction as the user row. */
type Client = Pick<Prisma.TransactionClient, 'account' | 'user' | 'session'>;

export interface SetPasswordLoginOptions {
    /**
     * End the user's sessions in the same write: all of them (`{}`), or all but `except` (the session the
     * caller is using). Omit to leave sessions alone (a brand-new user has none).
     */
    endSessions?: { except?: number | null };
}

/** Creates or replaces the user's credential Account with `hash` (from `hashPassword`) and mirrors it into `users.password`. */
export async function setPasswordLogin(
    client: Client,
    userId: number,
    hash: string,
    options: SetPasswordLoginOptions = {},
): Promise<void> {
    await client.user.update({ where: { id: userId }, data: { password: hash } });
    const updated = await client.account.updateMany({
        where: { userId, providerId: 'credential' },
        data: { password: hash },
    });
    if (updated.count === 0) {
        await client.account.create({
            data: { userId, providerId: 'credential', accountId: String(userId), password: hash },
        });
    }
    if (options.endSessions) await endSessions(client, userId, options.endSessions.except);
}

/**
 * Ends the user's sessions in one write: all of them, or all but `except` (the session the caller is
 * using). The one place that does it; also used when a changed email address must sign out other devices.
 */
export async function endSessions(client: Client, userId: number, except?: number | null): Promise<void> {
    await client.session.deleteMany({ where: { userId, ...(except == null ? {} : { NOT: { id: except } }) } });
}

/** The stored hash of the user's password login: the credential Account's, else the legacy `users.password`. */
export async function currentPasswordHash(userId: number): Promise<string | null> {
    const credential = await db.account.findFirst({ where: { userId, providerId: 'credential' } });
    if (credential?.password) return credential.password;
    const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
    return user?.password ?? null;
}

/** Verifies the user's current password; attempts are rate-limited per user. Throws BAD_REQUEST / TOO_MANY_REQUESTS. */
export async function assertPassword(userId: number, password: string): Promise<void> {
    if (!(await consumeRateLimit(`password:${userId}`, RATE_LIMITS.password))) {
        throw new RequestError('TOO_MANY_REQUESTS', 'Too many password attempts. Try again in 15 minutes.');
    }
    const hash = await currentPasswordHash(userId);
    if (!hash || !(await verifyPassword(hash, password))) {
        throw new RequestError('BAD_REQUEST', 'The provided password was incorrect.');
    }
}
