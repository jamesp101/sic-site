import { afterAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

// `vi.mock` is hoisted above the imports, so the factory loads the harness itself.
vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { RATE_LIMITS, assertUploadQuota, consumeRateLimit, consumeSignInAttempt } = await import('./rate-limit');
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
    it('shares one counter between spelling variants of the same email', async () => {
        const max = RATE_LIMITS.signIn.max;
        for (let i = 0; i < max; i++) {
            const email = i % 2 === 0 ? ' Admin@SIC.edu.ph ' : 'admin@sic.edu.ph';
            expect(await consumeSignInAttempt(email, T0)).toBe(true);
        }
        expect(await consumeSignInAttempt('admin@sic.edu.ph', T0)).toBe(false);
        expect(await consumeSignInAttempt(' ADMIN@sic.edu.ph', T0)).toBe(false);
    });

    it('counts different emails separately', async () => {
        for (let i = 0; i <= RATE_LIMITS.signIn.max; i++) await consumeSignInAttempt('locked@sic.edu.ph', T0);
        expect(await consumeSignInAttempt('locked@sic.edu.ph', T0)).toBe(false);
        expect(await consumeSignInAttempt('other@sic.edu.ph', T0)).toBe(true);
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
