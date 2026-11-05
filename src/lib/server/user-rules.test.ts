import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const removed: string[] = [];
vi.mock('./stored-files', () => ({
    deleteWithFiles: async (run: () => Promise<unknown>, owned: readonly (string | null)[]) => {
        const result = await run();
        removed.push(...owned.filter((key): key is string => key !== null));
        return result;
    },
}));

const { db } = await import('./db');
const { RequestError } = await import('./request-error');
const { assertUserDeletable, assertUserDemotable, deleteUserWithFiles, superadminTransaction } =
    await import('./user-rules');

afterAll(closeTestDb);

beforeEach(async () => {
    removed.length = 0;
    vi.restoreAllMocks();
    await db.user.deleteMany();
});

const newUser = (email: string, role: 'superadmin' | 'department_user') =>
    db.user.create({ data: { name: email, email, role } });

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return error instanceof RequestError ? error.code : 'OTHER';
    }
    return undefined;
};

const inTx = (check: typeof assertUserDeletable, userId: number) => superadminTransaction((tx) => check(tx, userId));

describe('last Superadmin checks', () => {
    it('refuse to delete or demote the only superadmin', async () => {
        const only = await newUser('a@example.com', 'superadmin');
        await newUser('b@example.com', 'department_user');
        expect(await codeOf(inTx(assertUserDeletable, only.id))).toBe('FORBIDDEN');
        expect(await codeOf(inTx(assertUserDemotable, only.id))).toBe('FORBIDDEN');
    });

    it('keep their messages', async () => {
        const only = await newUser('a@example.com', 'superadmin');
        await expect(inTx(assertUserDeletable, only.id)).rejects.toThrow(
            'The last superadmin account cannot be deleted.',
        );
        await expect(inTx(assertUserDemotable, only.id)).rejects.toThrow(
            'The last superadmin cannot be changed to a department user.',
        );
    });

    it('allow removing a superadmin while another remains', async () => {
        const first = await newUser('a@example.com', 'superadmin');
        await newUser('b@example.com', 'superadmin');
        expect(await codeOf(inTx(assertUserDeletable, first.id))).toBeUndefined();
        expect(await codeOf(inTx(assertUserDemotable, first.id))).toBeUndefined();
    });

    it('pass for a department user and for an unknown user', async () => {
        const only = await newUser('a@example.com', 'superadmin');
        const member = await newUser('b@example.com', 'department_user');
        expect(await codeOf(inTx(assertUserDeletable, member.id))).toBeUndefined();
        expect(await codeOf(inTx(assertUserDeletable, only.id + member.id + 1))).toBeUndefined();
    });

    it('refuse the second of two sequential removals', async () => {
        const a = await newUser('a@example.com', 'superadmin');
        const b = await newUser('b@example.com', 'superadmin');
        const demote = (id: number) =>
            superadminTransaction(async (tx) => {
                await assertUserDemotable(tx, id);
                await tx.user.update({ where: { id }, data: { role: 'department_user' } });
            });
        await demote(a.id);
        expect(await codeOf(demote(b.id))).toBe('FORBIDDEN');
        expect((await db.user.findUniqueOrThrow({ where: { id: b.id } })).role).toBe('superadmin');
    });
});

describe('superadminTransaction', () => {
    it('is one Serializable transaction: the check and the write commit or roll back together', async () => {
        const spy = vi.spyOn(db, '$transaction');
        const user = await newUser('a@example.com', 'department_user');
        await expect(
            superadminTransaction(async (tx) => {
                await tx.user.update({ where: { id: user.id }, data: { name: 'changed' } });
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'Serializable' });
        expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('a@example.com');
    });

    it('turns a write conflict or deadlock into a readable 409', async () => {
        vi.spyOn(db, '$transaction').mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2034' }));
        const error = await superadminTransaction(async () => 1).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(RequestError);
        expect(error).toMatchObject({
            code: 'CONFLICT',
            status: 409,
            message: 'Another change happened at the same time. Try again.',
        });
    });

    it('lets other errors through unchanged', async () => {
        vi.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('db down'));
        await expect(superadminTransaction(async () => 1)).rejects.toThrow('db down');
    });
});

describe('deleteUserWithFiles', () => {
    const withFiles = async (email: string, role: 'superadmin' | 'department_user') => {
        const user = await newUser(email, role);
        await db.post.create({
            data: {
                title: email,
                slug: email,
                content: '',
                type: 'article',
                highlightImagePath: `posts/${email}.webp`,
                userId: user.id,
            },
        });
        await db.download.create({
            data: { fileName: 'f.pdf', filePath: `downloads/${email}.pdf`, fileSize: 1, userId: user.id },
        });
        return user;
    };

    it('deletes the user and, after the commit, the files they own', async () => {
        await newUser('keep@example.com', 'superadmin');
        const user = await withFiles('gone@example.com', 'department_user');
        await deleteUserWithFiles(user.id);
        expect(await db.user.count({ where: { id: user.id } })).toBe(0);
        expect(removed.sort()).toEqual(['downloads/gone@example.com.pdf', 'posts/gone@example.com.webp']);
    });

    it('refuses the last superadmin and keeps the user and their files', async () => {
        const only = await withFiles('only@example.com', 'superadmin');
        expect(await codeOf(deleteUserWithFiles(only.id))).toBe('FORBIDDEN');
        expect(await db.user.count({ where: { id: only.id } })).toBe(1);
        expect(removed).toEqual([]);
    });

    it('is NOT_FOUND for an unknown user', async () => {
        expect(await codeOf(deleteUserWithFiles(999_999))).toBe('NOT_FOUND');
    });
});
