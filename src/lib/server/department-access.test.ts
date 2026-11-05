import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const departments = new Map<number, { id: number }>([[10, { id: 10 }]]);
const posts = new Map<number, { id: number; departmentId: number | null }>([
    [1, { id: 1, departmentId: 10 }],
    [2, { id: 2, departmentId: 11 }],
    [3, { id: 3, departmentId: null }],
]);

vi.mock('./db', () => ({
    db: {
        department: {
            findUnique: vi.fn(async ({ where }: { where: { id: number } }) => departments.get(where.id) ?? null),
        },
        post: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => posts.get(where.id) ?? null) },
    },
}));

const { assertDepartmentExists, loadOwnDepartment, loadScoped, resolveWriteDepartment } =
    await import('./department-access');

const admin = { id: 1, role: 'superadmin', departmentId: null };
const cit = { id: 2, role: 'department_user', departmentId: 10 };
const cba = { id: 3, role: 'department_user', departmentId: 11 };

async function codeOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        return (error as { code?: string }).code ?? 'OTHER';
    }
    return undefined;
}

beforeEach(() => vi.clearAllMocks());

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
        expect(await codeOf(resolveWriteDepartment({ id: 4, role: 'department_user', departmentId: null }, 10))).toBe(
            'FORBIDDEN',
        );
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
