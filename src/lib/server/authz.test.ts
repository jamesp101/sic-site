import { describe, expect, it } from 'vite-plus/test';
import {
    AuthzError,
    departmentFilter,
    departmentForWrite,
    requireSuperAdmin,
    requireUser,
    scopeDepartment,
} from './authz';

const admin = { id: 1, role: 'superadmin', departmentId: null };
const cit = { id: 2, role: 'department_user', departmentId: 10 };
const orphan = { id: 3, role: 'department_user', departmentId: null };

function codeOf(fn: () => unknown): string | undefined {
    try {
        fn();
    } catch (error) {
        return error instanceof AuthzError ? error.code : 'OTHER';
    }
    return undefined;
}

describe('requireUser / requireSuperAdmin', () => {
    it('rejects guests as UNAUTHORIZED', () => {
        expect(codeOf(() => requireUser(null))).toBe('UNAUTHORIZED');
        expect(codeOf(() => requireSuperAdmin(undefined))).toBe('UNAUTHORIZED');
    });

    it('rejects department users from superadmin-only actions', () => {
        expect(codeOf(() => requireSuperAdmin(cit))).toBe('FORBIDDEN');
        expect(requireSuperAdmin(admin)).toBe(admin);
    });
});

describe('scopeDepartment', () => {
    it('lets superadmin access any row', () => {
        expect(scopeDepartment(admin, { departmentId: 99 })).toEqual({ departmentId: 99 });
        expect(scopeDepartment(admin, { departmentId: null })).toEqual({ departmentId: null });
    });

    it('allows own department and forbids others', () => {
        expect(scopeDepartment(cit, { departmentId: 10 })).toEqual({ departmentId: 10 });
        expect(codeOf(() => scopeDepartment(cit, { departmentId: 11 }))).toBe('FORBIDDEN');
        expect(codeOf(() => scopeDepartment(cit, { departmentId: null }))).toBe('FORBIDDEN');
    });

    it('forbids department users without a department even on null rows', () => {
        expect(codeOf(() => scopeDepartment(orphan, { departmentId: null }))).toBe('FORBIDDEN');
    });

    it('reports missing rows as NOT_FOUND before checking ownership', () => {
        expect(codeOf(() => scopeDepartment(cit, null))).toBe('NOT_FOUND');
    });
});

describe('departmentForWrite / departmentFilter', () => {
    it('forces the actor department for department users', () => {
        expect(departmentForWrite(cit, 11)).toBe(10);
        expect(departmentForWrite(cit, null)).toBe(10);
        expect(codeOf(() => departmentForWrite(orphan, 10))).toBe('FORBIDDEN');
    });

    it('keeps the requested department for superadmin', () => {
        expect(departmentForWrite(admin, 11)).toBe(11);
        expect(departmentForWrite(admin, undefined)).toBeNull();
    });

    it('never matches any row for department users without a department', () => {
        expect(departmentFilter(admin)).toEqual({});
        expect(departmentFilter(cit)).toEqual({ departmentId: 10 });
        expect(departmentFilter(orphan)).toEqual({ departmentId: -1 });
    });
});
