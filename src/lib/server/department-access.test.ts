import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

// `vi.mock` is hoisted above the imports, so the factory loads the harness itself.
vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { db } = await import('./db');
const {
    assertDepartmentExists,
    departmentOptions,
    loadMember,
    loadOwnDepartment,
    loadScoped,
    loadScopedMany,
    resolveWriteDepartment,
} = await import('./department-access');

const admin = { id: 1, role: 'superadmin', departmentId: null };
const cit = { id: 2, role: 'department_user', departmentId: 10 };
const cba = { id: 3, role: 'department_user', departmentId: 11 };
const unassigned = { id: 4, role: 'department_user', departmentId: null };

async function codeOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        return (error as { code?: string }).code ?? 'OTHER';
    }
    return undefined;
}

beforeAll(async () => {
    await db.department.createMany({
        data: [
            { id: 10, name: 'CIT', slug: 'cit' },
            { id: 11, name: 'CBA', slug: 'cba' },
        ],
    });
    const user = await db.user.create({ data: { name: 'Owner', email: 'owner@example.test' } });
    await db.post.createMany({
        data: [
            { id: 1, departmentId: 10 },
            { id: 2, departmentId: 11 },
            { id: 3, departmentId: null },
        ].map((post) => ({
            ...post,
            title: `Post ${post.id}`,
            slug: `post-${post.id}`,
            content: 'Body',
            type: 'article',
            userId: user.id,
        })),
    });
    await db.carouselItem.createMany({
        data: [
            { id: 1, departmentId: 10 },
            { id: 2, departmentId: 10 },
            { id: 3, departmentId: 11 },
        ].map((slide) => ({ ...slide, imagePath: `carousels/${slide.id}.webp` })),
    });
    await db.member.createMany({
        data: [
            { id: 1, departmentId: 10 },
            { id: 2, departmentId: 11 },
        ].map((member) => ({ ...member, name: `Member ${member.id}`, role: 'Staff' })),
    });
});

afterAll(closeTestDb);

describe('resolveWriteDepartment', () => {
    it('lets a superadmin choose an existing department or none', async () => {
        expect(await resolveWriteDepartment(admin, 10)).toBe(10);
        expect(await resolveWriteDepartment(admin, null)).toBeNull();
        expect(await resolveWriteDepartment(admin, undefined)).toBeNull();
    });

    it('rejects a department that does not exist', async () => {
        expect(await codeOf(resolveWriteDepartment(admin, 99))).toBe('BAD_REQUEST');
        expect(await codeOf(assertDepartmentExists(99))).toBe('BAD_REQUEST');
    });

    it('forces department users into their own department whatever they request', async () => {
        expect(await resolveWriteDepartment(cit, 11)).toBe(10);
        expect(await resolveWriteDepartment(cit, null)).toBe(10);
    });

    it('forbids department users without a department', async () => {
        expect(await codeOf(resolveWriteDepartment(unassigned, 10))).toBe('FORBIDDEN');
    });
});

describe('loadScoped / loadOwnDepartment', () => {
    it('returns rows the actor may touch', async () => {
        expect((await loadScoped(admin, 'post', 2)).id).toBe(2);
        expect((await loadScoped(cit, 'post', 1)).id).toBe(1);
    });

    it('is NOT_FOUND for missing rows and null ids, FORBIDDEN for other departments', async () => {
        expect(await codeOf(loadScoped(cit, 'post', 99))).toBe('NOT_FOUND');
        expect(await codeOf(loadScoped(cit, 'post', null))).toBe('NOT_FOUND');
        expect(await codeOf(loadScoped(cit, 'post', 2))).toBe('FORBIDDEN');
        expect(await codeOf(loadScoped(cit, 'post', 3))).toBe('FORBIDDEN');
    });

    it('loads departments only for superadmins and their own department users', async () => {
        expect((await loadOwnDepartment(admin, 10)).id).toBe(10);
        expect((await loadOwnDepartment(cit, 10)).id).toBe(10);
        expect(await codeOf(loadOwnDepartment(cba, 10))).toBe('FORBIDDEN');
        expect(await codeOf(loadOwnDepartment(admin, 99))).toBe('NOT_FOUND');
    });
});

describe('loadScopedMany', () => {
    it('returns the rows in the order of the ids', async () => {
        expect((await loadScopedMany(cit, 'carouselItem', [2, 1])).map((row) => row.id)).toEqual([2, 1]);
        expect((await loadScopedMany(admin, 'carouselItem', [3, 1, 2])).map((row) => row.id)).toEqual([3, 1, 2]);
    });

    it('is NOT_FOUND when any id is missing', async () => {
        expect(await codeOf(loadScopedMany(cit, 'carouselItem', [1, 99]))).toBe('NOT_FOUND');
    });

    it('is FORBIDDEN when any row belongs to another department', async () => {
        expect(await codeOf(loadScopedMany(cit, 'carouselItem', [1, 3]))).toBe('FORBIDDEN');
        expect(await codeOf(loadScopedMany(unassigned, 'carouselItem', [1]))).toBe('FORBIDDEN');
    });
});

describe('loadMember', () => {
    it('returns a member of the department for its own users and superadmins', async () => {
        expect((await loadMember(cit, 10, 1)).id).toBe(1);
        expect((await loadMember(admin, 11, 2)).id).toBe(2);
    });

    it('is FORBIDDEN for another department, NOT_FOUND for a missing member or one of a different department', async () => {
        expect(await codeOf(loadMember(cba, 10, 1))).toBe('FORBIDDEN');
        expect(await codeOf(loadMember(cit, 10, 99))).toBe('NOT_FOUND');
        expect(await codeOf(loadMember(cit, 10, 2))).toBe('NOT_FOUND');
        expect(await codeOf(loadMember(admin, 99, 1))).toBe('NOT_FOUND');
    });
});

describe('departmentOptions', () => {
    it('lists every department for superadmins and only their own for department users', async () => {
        expect((await departmentOptions(admin)).map((department) => department.name)).toEqual(['CBA', 'CIT']);
        expect(await departmentOptions(cit)).toEqual([{ id: 10, name: 'CIT' }]);
        expect(await departmentOptions(unassigned)).toEqual([]);
    });
});
