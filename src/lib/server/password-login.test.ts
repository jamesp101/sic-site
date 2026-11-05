import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { db } = await import('./db');
const { hashPassword } = await import('./password');
const { assertPassword, currentPasswordHash, setPasswordLogin } = await import('./password-login');
const { RequestError } = await import('./request-error');
const { RATE_LIMITS } = await import('./rate-limit');

afterAll(closeTestDb);

beforeEach(async () => {
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.rateLimit.deleteMany();
    await db.user.deleteMany();
});

const newUser = (email: string, password?: string) =>
    db.user.create({ data: { name: 'Test', email, role: 'superadmin', ...(password ? { password } : {}) } });

const newSession = (userId: number, token: string) =>
    db.session.create({ data: { userId, token, expiresAt: new Date(Date.now() + 60_000) } });

async function failure(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        return error instanceof RequestError ? error.code : 'OTHER';
    }
    return undefined;
}

describe('setPasswordLogin', () => {
    it('creates the credential account and mirrors the hash into users.password', async () => {
        const user = await newUser('a@example.com');
        await setPasswordLogin(db, user.id, 'hash-1');

        const account = await db.account.findMany({ where: { userId: user.id } });
        expect(account).toHaveLength(1);
        expect(account[0]).toMatchObject({ providerId: 'credential', accountId: String(user.id), password: 'hash-1' });
        expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).password).toBe('hash-1');
    });

    it('replaces the hash of an existing credential account instead of adding another', async () => {
        const user = await newUser('a@example.com');
        await setPasswordLogin(db, user.id, 'hash-1');
        await setPasswordLogin(db, user.id, 'hash-2');

        expect(await db.account.findMany({ where: { userId: user.id } })).toMatchObject([{ password: 'hash-2' }]);
        expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).password).toBe('hash-2');
    });

    it('leaves sessions alone unless asked to end them', async () => {
        const user = await newUser('a@example.com');
        await newSession(user.id, 't1');
        await setPasswordLogin(db, user.id, 'hash-1');
        expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    });

    it("ends every session, or every one except the caller's", async () => {
        const user = await newUser('a@example.com');
        const other = await newUser('b@example.com');
        const mine = await newSession(user.id, 't1');
        await newSession(user.id, 't2');
        const theirs = await newSession(other.id, 't3');

        await setPasswordLogin(db, user.id, 'hash-1', { endSessions: { except: mine.id } });
        expect((await db.session.findMany({ where: { userId: user.id } })).map((s) => s.id)).toEqual([mine.id]);

        await setPasswordLogin(db, user.id, 'hash-2', { endSessions: {} });
        expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
        expect(await db.session.count({ where: { id: theirs.id } })).toBe(1);
    });

    it("joins the caller's transaction: a rollback leaves no half-set login", async () => {
        const user = await newUser('a@example.com');
        await db
            .$transaction(async (tx) => {
                await setPasswordLogin(tx, user.id, 'hash-1');
                throw new Error('rollback');
            })
            .catch(() => undefined);
        expect(await db.account.count({ where: { userId: user.id } })).toBe(0);
        expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).password).toBeNull();
    });
});

describe('currentPasswordHash', () => {
    it('prefers the credential account, falls back to the legacy users.password, else null', async () => {
        const legacy = await newUser('legacy@example.com', 'legacy-hash');
        expect(await currentPasswordHash(legacy.id)).toBe('legacy-hash');

        await db.account.create({
            data: {
                userId: legacy.id,
                providerId: 'credential',
                accountId: String(legacy.id),
                password: 'account-hash',
            },
        });
        expect(await currentPasswordHash(legacy.id)).toBe('account-hash');

        const none = await newUser('none@example.com');
        expect(await currentPasswordHash(none.id)).toBeNull();
    });
});

describe('assertPassword', () => {
    it('accepts the right password and rejects a wrong one or a user without a login', async () => {
        const user = await newUser('a@example.com');
        await setPasswordLogin(db, user.id, await hashPassword('correct-horse'));

        expect(await failure(assertPassword(user.id, 'correct-horse'))).toBeUndefined();
        expect(await failure(assertPassword(user.id, 'wrong'))).toBe('BAD_REQUEST');
        const none = await newUser('none@example.com');
        expect(await failure(assertPassword(none.id, 'anything'))).toBe('BAD_REQUEST');
    });

    it('stops checking after too many attempts', async () => {
        const user = await newUser('a@example.com');
        for (let i = 0; i < RATE_LIMITS.password.max; i++) {
            expect(await failure(assertPassword(user.id, 'wrong'))).toBe('BAD_REQUEST');
        }
        expect(await failure(assertPassword(user.id, 'wrong'))).toBe('TOO_MANY_REQUESTS');
    });
});
