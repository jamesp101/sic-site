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
    /** Failed password sign-ins (`/api/auth/sign-in/email`, `/login`) per normalised email and client IP: the hard block. */
    signInFailuresPerIp: { max: 10, window: 15 * 60 },
    /**
     * Failed password sign-ins per normalised email whatever the client IP: a backstop against guessing spread over
     * many addresses. High enough that one attacker cannot lock a User out with a few requests.
     */
    signInFailuresPerEmail: { max: 100, window: 15 * 60 },
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

/** Rows older than the longest window can no longer affect any rule. */
const LONGEST_WINDOW_MS = Math.max(...Object.values(RATE_LIMITS).map((rule) => rule.window)) * 1000;

/** Deletes the `app:` counters whose window ended long ago (the daily storage cleanup); returns how many it removed. */
export async function sweepExpiredRateLimits(now = Date.now()): Promise<number> {
    const { count } = await db.rateLimit.deleteMany({
        where: { key: { startsWith: 'app:' }, lastRequest: { lte: BigInt(now - LONGEST_WINDOW_MS) } },
    });
    return count;
}

/** True when `key` already used up `rule` in its current window. Counts nothing. */
async function isRateLimited(key: string, rule: RateLimitRule, now: number): Promise<boolean> {
    const row = await db.rateLimit.findUnique({
        where: { key: `app:${key}` },
        select: { count: true, lastRequest: true },
    });
    return row !== null && row.lastRequest > BigInt(now - rule.window * 1000) && row.count >= rule.max;
}

/** Hashed so the key always fits the column and no address is stored. The email is trimmed and lower-cased, so spelling variants share a counter. */
const signInKey = (email: string, clientIp?: string) => {
    const normalised = email.trim().toLowerCase();
    const digest = createHash('sha256').update(clientIp === undefined ? normalised : `${normalised}\n${clientIp}`);
    return `signin:${clientIp === undefined ? 'email' : 'ip'}:${digest.digest('hex')}`;
};

/**
 * True when this email may not be tried from this address now: it already failed too often from there, or too
 * often overall. Counts nothing, so a refused attempt adds no failure; a correct password from another address
 * still works while that address has not used up its own failures.
 */
export async function isSignInBlocked(email: string, clientIp: string, now = Date.now()): Promise<boolean> {
    const [perIp, perEmail] = await Promise.all([
        isRateLimited(signInKey(email, clientIp), RATE_LIMITS.signInFailuresPerIp, now),
        isRateLimited(signInKey(email), RATE_LIMITS.signInFailuresPerEmail, now),
    ]);
    return perIp || perEmail;
}

/** Counts one failed sign-in of `email` from `clientIp` against both limits. */
export async function recordSignInFailure(email: string, clientIp: string, now = Date.now()): Promise<void> {
    await consumeRateLimit(signInKey(email, clientIp), RATE_LIMITS.signInFailuresPerIp, now);
    await consumeRateLimit(signInKey(email), RATE_LIMITS.signInFailuresPerEmail, now);
}
