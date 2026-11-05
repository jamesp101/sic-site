import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
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
const { resolveRequestContext } = await import('./request-context');

afterAll(closeTestDb);

const PASSWORD = 'correct-password-1';
let cit: { id: number; name: string; slug: string };
let cba: { id: number; name: string; slug: string };
let superSession: string;
let deptSession: string;
let deptUserId: number;

async function createUser(email: string, role: string, departmentId: number | null) {
    const user = await db.user.create({ data: { name: email, email, role, departmentId, emailVerified: true } });
    await setPasswordLogin(db, user.id, await hashPassword(PASSWORD));
    return user;
}

/** Signs in through Better Auth and returns the session cookie a browser would send back. */
async function sessionCookie(email: string, ip: string): Promise<string> {
    const res = await auth.handler(
        new Request('http://localhost/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'http://localhost', 'x-sic-client-ip': ip },
            body: JSON.stringify({ email, password: PASSWORD }),
        }),
    );
    expect(res.status).toBe(200);
    return res.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
}

beforeAll(async () => {
    const pick = ({ id, name, slug }: { id: number; name: string; slug: string }) => ({ id, name, slug });
    cit = pick(await db.department.create({ data: { name: 'IT', slug: 'it', description: '' } }));
    cba = pick(await db.department.create({ data: { name: 'Business', slug: 'business', description: '' } }));
    await createUser('super@example.org', 'superadmin', null);
    superSession = await sessionCookie('super@example.org', '10.1.0.1');
    deptUserId = (await createUser('dept@example.org', 'department_user', cit.id)).id;
    deptSession = await sessionCookie('dept@example.org', '10.1.0.2');
}, 30_000);

const headers = (cookie: string, scope?: string) =>
    new Headers({ cookie: scope === undefined ? cookie : `${cookie}; admin_scope=${scope}` });

describe('resolveRequestContext: user and session', () => {
    it('is signed out without a session cookie or with an unknown one', async () => {
        for (const h of [new Headers(), new Headers({ cookie: 'better-auth.session_token=nonsense' })]) {
            expect(await resolveRequestContext(h, { scoped: true })).toMatchObject({
                user: null,
                session: null,
                adminScope: { kind: 'all' },
                adminDepartments: [],
            });
        }
    });

    it('maps the session to a User with numeric ids and the Department', async () => {
        const context = await resolveRequestContext(headers(deptSession), { scoped: false });
        expect(context.user).toEqual({
            id: deptUserId,
            name: 'dept@example.org',
            email: 'dept@example.org',
            emailVerified: true,
            role: 'department_user',
            departmentId: cit.id,
        });
        expect(context.session).not.toBeNull();
        expect(typeof context.user?.id).toBe('number');
        expect(typeof context.user?.departmentId).toBe('number');
    });

    it('gives a Superadmin without a Department a null departmentId', async () => {
        const { user } = await resolveRequestContext(headers(superSession), { scoped: false });
        expect(user).toMatchObject({ role: 'superadmin', departmentId: null });
    });

    it('does not load the Admin scope on a route that has none', async () => {
        const context = await resolveRequestContext(headers(superSession, 'main'), { scoped: false });
        expect(context.adminScope).toEqual({ kind: 'all' });
        expect(context.adminDepartments).toEqual([]);
    });
});

describe('resolveRequestContext: Admin scope', () => {
    const scopeOf = async (cookie: string, scope?: string) =>
        (await resolveRequestContext(headers(cookie, scope), { scoped: true })).adminScope;

    it('gives a Superadmin the scope the cookie names and the full switcher list', async () => {
        expect(await scopeOf(superSession)).toEqual({ kind: 'all' });
        expect(await scopeOf(superSession, 'all')).toEqual({ kind: 'all' });
        expect(await scopeOf(superSession, 'main')).toEqual({ kind: 'main' });
        expect(await scopeOf(superSession, String(cba.id))).toEqual({ kind: 'department', ...cba });
        const { adminDepartments } = await resolveRequestContext(headers(superSession), { scoped: true });
        expect(adminDepartments.map((d) => d.id)).toEqual([cba.id, cit.id]);
    });

    it('falls back to all for an unknown Department id or a malformed cookie', async () => {
        expect(await scopeOf(superSession, '987654')).toEqual({ kind: 'all' });
        expect(await scopeOf(superSession, 'not-a-scope')).toEqual({ kind: 'all' });
    });

    it('pins a Department user to their own Department whatever the cookie says', async () => {
        const own = { kind: 'department', ...cit };
        expect(await scopeOf(deptSession)).toEqual(own);
        expect(await scopeOf(deptSession, String(cba.id))).toEqual(own);
        expect(await scopeOf(deptSession, 'main')).toEqual(own);
        expect(await scopeOf(deptSession, 'all')).toEqual(own);
        const { adminDepartments } = await resolveRequestContext(headers(deptSession), { scoped: true });
        expect(adminDepartments.map((d) => d.id)).toEqual([cit.id]);
    });
});
