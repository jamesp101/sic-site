import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => {
    const { openTestDb } = await import('./test-db');
    return { db: await openTestDb(), dbProvider: 'sqlite' };
});
vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-with-enough-entropy-0123456789abcdef');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost');

const { auth } = await import('./auth');
const { db } = await import('./db');
const { RATE_LIMITS } = await import('./rate-limit');

afterAll(closeTestDb);
beforeEach(async () => {
    await db.rateLimit.deleteMany();
});

let client = 0;
/** Each call comes from its own address, so Better Auth's own per-IP limit never answers instead of ours. */
const post = (path: string, body: unknown = {}) =>
    auth.handler(
        new Request(`http://localhost/api/auth${path}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                origin: 'http://localhost',
                'x-sic-client-ip': `10.0.${Math.floor(client / 250)}.${client++ % 250}`,
            },
            body: JSON.stringify(body),
        }),
    );

describe('sign-in rate limit per email', () => {
    it('answers 429 once one email was tried more than the limit, whatever its spelling', async () => {
        const attempt = (email: string) => post('/sign-in/email', { email, password: 'wrong-password' });
        for (let i = 0; i < RATE_LIMITS.signIn.max; i++) {
            expect((await attempt(i % 2 ? ' Someone@Example.org ' : 'someone@example.org')).status).not.toBe(429);
        }
        const blocked = await attempt('SOMEONE@example.org');
        expect(blocked.status).toBe(429);
        expect(await blocked.json()).toMatchObject({ message: expect.stringContaining('Too many attempts') });
        // Another account is unaffected.
        expect((await attempt('other@example.org')).status).not.toBe(429);
    });
});

describe('Better Auth paths the app does not use', () => {
    it.each(['/change-password', '/update-user', '/delete-user', '/change-email', '/revoke-sessions'])(
        '%s is not served',
        async (path) => {
            expect((await post(path)).status).toBe(404);
        },
    );

    it('keeps the ones the forms call', async () => {
        for (const path of ['/request-password-reset', '/reset-password', '/send-verification-email']) {
            expect((await post(path, {})).status, path).not.toBe(404);
        }
    });
});
