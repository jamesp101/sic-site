import { afterAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

// `vi.mock` is hoisted above the imports, so the factory loads the harness itself.
vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const {
    RATE_LIMITS,
    assertUploadQuota,
    consumeRateLimit,
    claimSignInAttempt,
    refundSignInAttempt,
    sweepExpiredRateLimits,
} = await import('./rate-limit');
const { db } = await import('./db');
const { RequestError } = await import('./request-error');

afterAll(closeTestDb);

const RULE = { max: 3, window: 60 };
const T0 = 1_800_000_000_000;

describe('rate limit window', () => {
    it('allows exactly max hits within the window and refuses the next', async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 5; i++) results.push(await consumeRateLimit('window-basic', RULE, T0 + i * 1000));
        expect(results).toEqual([true, true, true, false, false]);
    });

    it('allows again once the window has elapsed', async () => {
        for (let i = 0; i < 4; i++) await consumeRateLimit('window-reset', RULE, T0);
        expect(await consumeRateLimit('window-reset', RULE, T0 + 59_000)).toBe(false);
        expect(await consumeRateLimit('window-reset', RULE, T0 + 60_000)).toBe(true);
        expect(await consumeRateLimit('window-reset', RULE, T0 + 61_000)).toBe(true);
        expect(await consumeRateLimit('window-reset', RULE, T0 + 62_000)).toBe(true);
        expect(await consumeRateLimit('window-reset', RULE, T0 + 63_000)).toBe(false);
    });

    it('counts separate keys independently', async () => {
        for (let i = 0; i < 4; i++) await consumeRateLimit('key-a', RULE, T0);
        expect(await consumeRateLimit('key-a', RULE, T0)).toBe(false);
        expect(await consumeRateLimit('key-b', RULE, T0)).toBe(true);
    });

    it('counts both hits of two concurrent first requests for a new key', async () => {
        const [first, second] = await Promise.all([
            consumeRateLimit('race', { max: 2, window: 60 }, T0),
            consumeRateLimit('race', { max: 2, window: 60 }, T0),
        ]);
        expect([first, second]).toEqual([true, true]);
        expect(await consumeRateLimit('race', { max: 2, window: 60 }, T0)).toBe(false);
    });
});

describe('sign-in attempts', () => {
    const MINUTE = 60_000;

    it('allows 10 attempts per email and address, whatever the spelling, and no other address or email', async () => {
        for (let i = 0; i < 10; i++) {
            expect(await claimSignInAttempt(i % 2 === 0 ? ' A@SIC.edu.ph ' : 'a@sic.edu.ph', '198.51.100.1', T0)).toBe(
                true,
            );
        }
        expect(await claimSignInAttempt('A@sic.edu.ph', '198.51.100.1', T0)).toBe(false);
        expect(await claimSignInAttempt('a@sic.edu.ph', '198.51.100.2', T0)).toBe(true);
        expect(await claimSignInAttempt('b@sic.edu.ph', '198.51.100.1', T0)).toBe(true);
    });

    it('allows 100 attempts per email over all addresses, then refuses every address', async () => {
        for (let i = 0; i < 100; i++) expect(await claimSignInAttempt('c@sic.edu.ph', `192.0.2.${i}`, T0)).toBe(true);
        expect(await claimSignInAttempt('c@sic.edu.ph', '192.0.2.200', T0)).toBe(false);
        expect(await claimSignInAttempt('d@sic.edu.ph', '192.0.2.200', T0)).toBe(true);
    }, 60_000);

    it('does not keep a slot for the address when the per-email limit refused it', async () => {
        for (let i = 0; i < 100; i++) await claimSignInAttempt('f@sic.edu.ph', `192.0.2.${i}`, T0);
        for (let i = 0; i < 20; i++) expect(await claimSignInAttempt('f@sic.edu.ph', '192.0.2.250', T0)).toBe(false);
        const row = await db.rateLimit.findMany({ where: { key: { startsWith: 'app:signin:ip:' }, count: { gt: 0 } } });
        expect(row.every((r) => r.count <= 10)).toBe(true);
    }, 60_000);

    it('never lets more than the limit through 15 concurrent attempts', async () => {
        const results = await Promise.all(
            Array.from({ length: 15 }, () => claimSignInAttempt('g@sic.edu.ph', '198.51.100.7', T0)),
        );
        expect(results.filter(Boolean)).toHaveLength(10);
    });

    it('gives the slots back on success, so only failures count', async () => {
        for (let i = 0; i < 9; i++) await claimSignInAttempt('h@sic.edu.ph', '198.51.100.8', T0);
        for (let i = 0; i < 5; i++) {
            expect(await claimSignInAttempt('h@sic.edu.ph', '198.51.100.8', T0)).toBe(true);
            await refundSignInAttempt('h@sic.edu.ph', '198.51.100.8', T0);
        }
        expect(await claimSignInAttempt('h@sic.edu.ph', '198.51.100.8', T0)).toBe(true);
        expect(await claimSignInAttempt('h@sic.edu.ph', '198.51.100.8', T0)).toBe(false);
    });

    it('lets an address in again 15 minutes after the window began, however often it was refused', async () => {
        for (let i = 0; i < 10; i++) await claimSignInAttempt('e@sic.edu.ph', '198.51.100.9', T0);
        for (let i = 0; i < 5; i++) {
            expect(await claimSignInAttempt('e@sic.edu.ph', '198.51.100.9', T0 + 14 * MINUTE)).toBe(false);
        }
        expect(await claimSignInAttempt('e@sic.edu.ph', '198.51.100.9', T0 + 15 * MINUTE)).toBe(true);
    });
});

describe('sweepExpiredRateLimits', () => {
    it('removes app counters whose window is over and keeps current ones and Better Auth rows', async () => {
        const HOUR = 60 * 60 * 1000;
        await db.rateLimit.deleteMany();
        await db.rateLimit.createMany({
            data: [
                { key: 'app:old', count: 3, lastRequest: BigInt(T0 - 2 * HOUR) },
                { key: 'app:current', count: 3, lastRequest: BigInt(T0 - 10 * 60_000) },
                { key: '203.0.113.7/sign-in/email', count: 1, lastRequest: BigInt(T0 - 2 * HOUR) },
            ],
        });
        expect(await sweepExpiredRateLimits(T0)).toBe(1);
        const keys = (await db.rateLimit.findMany({ select: { key: true } })).map((row) => row.key).sort();
        expect(keys).toEqual(['203.0.113.7/sign-in/email', 'app:current']);
    });
});

describe('upload quota', () => {
    it('throws TOO_MANY_REQUESTS once the user has used the quota, and only for that user', async () => {
        for (let i = 0; i < RATE_LIMITS.upload.max; i++) await assertUploadQuota(101);
        const error = await assertUploadQuota(101).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(RequestError);
        expect((error as InstanceType<typeof RequestError>).code).toBe('TOO_MANY_REQUESTS');
        await expect(assertUploadQuota(102)).resolves.toBeUndefined();
    });
});
