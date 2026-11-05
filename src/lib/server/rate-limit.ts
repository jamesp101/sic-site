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
    /** Password sign-in attempts that stay failed (`/api/auth/sign-in/email`, `/login`) per normalised email and client IP: the hard block. */
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
    await ensureCounter(rowKey, now);
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

/** Hashed so the key always fits the column and no address is stored. The email is trimmed and lower-cased, so spelling variants share a counter. */
const signInKey = (email: string, clientIp?: string) => {
    const normalised = email.trim().toLowerCase();
    const digest = createHash('sha256').update(clientIp === undefined ? normalised : `${normalised}\n${clientIp}`);
    return `signin:${clientIp === undefined ? 'email' : 'ip'}:${digest.digest('hex')}`;
};

/** Creates the counter row for `rowKey` unless it exists; a concurrent creator winning the race is fine. */
async function ensureCounter(rowKey: string, now: number): Promise<void> {
    if (await db.rateLimit.findUnique({ where: { key: rowKey }, select: { id: true } })) return;
    try {
        await db.rateLimit.create({ data: { key: rowKey, count: 0, lastRequest: BigInt(now) } });
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
}

/**
 * Takes one slot of `rule` for `key` in a single conditional update (`count < max`), so concurrent callers can
 * never take more than `max` between them. Returns false, taking nothing, when the window is full.
 */
async function claimSlot(key: string, rule: RateLimitRule, now: number): Promise<boolean> {
    const rowKey = `app:${key}`;
    await ensureCounter(rowKey, now);
    await db.rateLimit.updateMany({
        where: { key: rowKey, lastRequest: { lte: BigInt(now - rule.window * 1000) } },
        data: { count: 0, lastRequest: BigInt(now) },
    });
    const { count } = await db.rateLimit.updateMany({
        where: { key: rowKey, count: { lt: rule.max } },
        data: { count: { increment: 1 } },
    });
    return count === 1;
}

/** Gives back one slot taken with `claimSlot` in the same window (never below zero). */
async function refundSlot(key: string, rule: RateLimitRule, now: number): Promise<void> {
    await db.rateLimit.updateMany({
        where: { key: `app:${key}`, count: { gt: 0 }, lastRequest: { gt: BigInt(now - rule.window * 1000) } },
        data: { count: { decrement: 1 } },
    });
}

/**
 * Counts a password sign-in attempt of `email` from `clientIp` against both limits before the password is
 * checked, atomically: returns false (and counts nothing) when either the per-address or the per-email limit is
 * already full, so a burst of parallel guesses cannot exceed it. A correct password is refunded with
 * `refundSignInAttempt`, so only failures stay counted. The hard block is per email and address (one address
 * cannot lock a User out for everyone); the high per-email ceiling backstops guessing spread over many addresses.
 */
export async function claimSignInAttempt(email: string, clientIp: string, now = Date.now()): Promise<boolean> {
    const ipKey = signInKey(email, clientIp);
    if (!(await claimSlot(ipKey, RATE_LIMITS.signInFailuresPerIp, now))) return false;
    if (await claimSlot(signInKey(email), RATE_LIMITS.signInFailuresPerEmail, now)) return true;
    await refundSlot(ipKey, RATE_LIMITS.signInFailuresPerIp, now);
    return false;
}

/** Gives back the attempt taken by `claimSignInAttempt` (the sign-in succeeded). */
export async function refundSignInAttempt(email: string, clientIp: string, now = Date.now()): Promise<void> {
    await refundSlot(signInKey(email, clientIp), RATE_LIMITS.signInFailuresPerIp, now);
    await refundSlot(signInKey(email), RATE_LIMITS.signInFailuresPerEmail, now);
}
