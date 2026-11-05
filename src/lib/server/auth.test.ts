import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => {
    const { openTestDb } = await import('./test-db');
    return { db: await openTestDb(), dbProvider: 'sqlite' };
});
vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-with-enough-entropy-0123456789abcdef');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost');

const { auth } = await import('./auth');
const { db } = await import('./db');
const { hashPassword } = await import('./password');
const { setPasswordLogin } = await import('./password-login');

afterAll(closeTestDb);

const EMAIL = 'member@example.org';
const PASSWORD = 'correct-password-1';

beforeAll(async () => {
    const user = await db.user.create({ data: { name: 'Member', email: EMAIL, role: 'department_user' } });
    await setPasswordLogin(db, user.id, await hashPassword(PASSWORD));
});
beforeEach(async () => {
    await db.rateLimit.deleteMany();
});

let client = 0;
/** Without `ip`, each call comes from its own address. */
const post = (path: string, body: unknown = {}, ip = `10.0.${Math.floor(client / 250)}.${client++ % 250}`) =>
    auth.handler(
        new Request(`http://localhost/api/auth${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'http://localhost', 'x-sic-client-ip': ip },
            body: JSON.stringify(body),
        }),
    );

/** Better Auth's own per-address rule (5 a minute) is not under test: forget its counters before each sign-in. */
const signIn = async (ip: string, password: string, email = EMAIL) => {
    await db.rateLimit.deleteMany({ where: { NOT: { key: { startsWith: 'app:' } } } });
    return post('/sign-in/email', { email, password }, ip);
};

describe('sign-in lockout', () => {
    it('blocks an address after 10 failures for that email, whatever its spelling, and not another address', async () => {
        for (let i = 0; i < 10; i++) {
            const res = await signIn('203.0.113.1', 'wrong-password', i % 2 ? 'MEMBER@Example.org' : EMAIL);
            expect(res.status).toBe(401);
        }
        const blocked = await signIn('203.0.113.1', PASSWORD);
        expect(blocked.status).toBe(429);
        expect(await blocked.json()).toMatchObject({ message: expect.stringContaining('Too many attempts') });
        // The same address may still try another account.
        expect((await signIn('203.0.113.1', 'wrong-password', 'other@example.org')).status).toBe(401);
    }, 60_000);

    it('lets the right password in from another address after one address was blocked', async () => {
        for (let i = 0; i < 11; i++) await signIn('203.0.113.2', 'wrong-password');
        expect((await signIn('203.0.113.2', PASSWORD)).status).toBe(429);
        expect((await signIn('203.0.113.3', PASSWORD)).status).toBe(200);
    }, 60_000);

    it('does not count successful sign-ins', async () => {
        for (let i = 0; i < 9; i++) await signIn('203.0.113.4', 'wrong-password');
        for (let i = 0; i < 4; i++) expect((await signIn('203.0.113.4', PASSWORD)).status).toBe(200);
        // Nine failures and four successes: the tenth failure is still answered, the next attempt is refused.
        expect((await signIn('203.0.113.4', 'wrong-password')).status).toBe(401);
        expect((await signIn('203.0.113.4', PASSWORD)).status).toBe(429);
    }, 60_000);
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
