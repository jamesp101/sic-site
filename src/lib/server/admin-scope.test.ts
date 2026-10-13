import { describe, expect, it } from 'vite-plus/test';
import { parseScope, resolveScope, scopeDefaultDepartment, scopeLabel, scopeWhere } from './admin-scope';

const admin = { id: 1, role: 'superadmin', departmentId: null };
const cit = { id: 2, role: 'department_user', departmentId: 10 };
const orphan = { id: 3, role: 'department_user', departmentId: null };
const departments = [
    { id: 10, name: 'College of IT', slug: 'cit' },
    { id: 11, name: 'College of Business', slug: 'cba' },
];

describe('parseScope', () => {
    it('parses all, main and ids', () => {
        expect(parseScope('all')).toEqual({ kind: 'all' });
        expect(parseScope('main')).toEqual({ kind: 'main' });
        expect(parseScope('10')).toEqual({ kind: 'department', id: 10 });
    });

    it('falls back to all for missing or malformed values', () => {
        for (const value of [undefined, null, '', 'nope', '0', '-3', '1.5', '10abc', '99999999999']) {
            expect(parseScope(value)).toEqual({ kind: 'all' });
        }
    });
});

describe('resolveScope', () => {
    it('lets superadmins choose freely', () => {
        expect(resolveScope(admin, { kind: 'all' }, departments)).toEqual({ kind: 'all' });
        expect(resolveScope(admin, { kind: 'main' }, departments)).toEqual({ kind: 'main' });
        expect(resolveScope(admin, { kind: 'department', id: 11 }, departments)).toEqual({
            kind: 'department',
            id: 11,
            name: 'College of Business',
            slug: 'cba',
        });
    });

    it('falls back to all for unknown or deleted departments', () => {
        expect(resolveScope(admin, { kind: 'department', id: 999 }, departments)).toEqual({ kind: 'all' });
        expect(resolveScope(admin, { kind: 'department', id: 10 }, [])).toEqual({ kind: 'all' });
    });

    it('pins department users to their own department and ignores the cookie', () => {
        const own = { kind: 'department', id: 10, name: 'College of IT', slug: 'cit' };
        expect(resolveScope(cit, { kind: 'all' }, departments)).toEqual(own);
        expect(resolveScope(cit, { kind: 'main' }, departments)).toEqual(own);
        expect(resolveScope(cit, { kind: 'department', id: 11 }, departments)).toEqual(own);
    });

    it('gives a department user without a (valid) department the all scope; authz still restricts rows', () => {
        expect(resolveScope(orphan, { kind: 'main' }, departments)).toEqual({ kind: 'all' });
        expect(resolveScope(cit, { kind: 'all' }, [])).toEqual({ kind: 'all' });
    });
});

describe('scopeWhere / helpers', () => {
    const citScope = { kind: 'department', id: 10, name: 'College of IT', slug: 'cit' } as const;

    it('builds the Prisma fragment', () => {
        expect(scopeWhere({ kind: 'all' })).toEqual({});
        expect(scopeWhere({ kind: 'main' })).toEqual({ departmentId: null });
        expect(scopeWhere(citScope)).toEqual({ departmentId: 10 });
    });

    it('labels scopes', () => {
        expect(scopeLabel({ kind: 'all' })).toBe('All departments');
        expect(scopeLabel({ kind: 'main' })).toBe('Main page');
        expect(scopeLabel(citScope)).toBe('College of IT');
    });

    it('suggests the create-form department', () => {
        expect(scopeDefaultDepartment({ kind: 'all' })).toBeUndefined();
        expect(scopeDefaultDepartment({ kind: 'main' })).toBeNull();
        expect(scopeDefaultDepartment(citScope)).toBe(10);
    });
});
