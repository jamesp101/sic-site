import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { RequestError } from './request-error';

export interface RateLimitRule {
    /** Attempts allowed per window. */
    max: number;
    /** Window length in seconds. */
    window: number;
}

export const RATE_LIMITS = {
    /** Current-password checks (confirm, change password, delete account, email change), per user. */
    password: { max: 10, window: 15 * 60 },
    /** Anonymous contact form, per client IP. */
    contact: { max: 5, window: 60 * 60 },
    /** Uploads that are not yet attached to a record (inline images, layer images, presigned URLs), per user. */
    upload: { max: 60, window: 10 * 60 },
    /** Password sign-ins (`/api/auth/sign-in/email`, `/login`), per normalised email on top of Better Auth's per-IP rule. */
    signIn: { max: 10, window: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Counts one attempt for `key` and returns false once more than `rule.max` attempts fall in the
 * current fixed window. Counters live in `auth_rate_limits` (shared by every serverless instance)
 * under an `app:` prefix so they never collide with Better Auth's own keys.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule, now = Date.now()): Promise<boolean> {
    const rowKey = `app:${key}`;
    const existing = await db.rateLimit.findUnique({ where: { key: rowKey }, select: { id: true } });
    if (!existing) {
        try {
            await db.rateLimit.create({ data: { key: rowKey, count: 0, lastRequest: BigInt(now) } });
        } catch (error) {
            // A concurrent request created the row first.
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        }
    }
    // `lastRequest` holds the start of the current window; restart it once it has elapsed.
    await db.rateLimit.updateMany({
        where: { key: rowKey, lastRequest: { lte: BigInt(now - rule.window * 1000) } },
        data: { count: 0, lastRequest: BigInt(now) },
    });
    const row = await db.rateLimit.update({ where: { key: rowKey }, data: { count: { increment: 1 } } });
    return row.count <= rule.max;
}

/** Counts one upload (inline image, layer image, presigned URL) for the user; throws TOO_MANY_REQUESTS over the limit. */
export async function assertUploadQuota(userId: number): Promise<void> {
    if (!(await consumeRateLimit(`upload:${userId}`, RATE_LIMITS.upload))) {
        throw new RequestError('TOO_MANY_REQUESTS', 'Too many uploads. Try again in a few minutes.');
    }
}

/**
 * Counts one sign-in attempt for `email` (trimmed, lower-cased, so spelling variants share a counter);
 * false once the account has been tried too often, whatever the client address. The email is hashed so the
 * key always fits the column and no address is stored.
 */
export function consumeSignInAttempt(email: string, now = Date.now()): Promise<boolean> {
    const digest = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return consumeRateLimit(`signin:${digest}`, RATE_LIMITS.signIn, now);
}
