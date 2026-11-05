/**
 * Admin scope: the department context chosen in the sidebar switcher.
 * Free of `astro:*` imports so it is unit-testable. `departmentWhere` is the only way to turn
 * (actor, scope) into a list filter and `listWhere` the only way to add more conditions to it: the
 * actor's restriction always wins over the scope and over any search or filter.
 */
import { isSuperAdmin, type Actor } from './authz';

export const SCOPE_COOKIE = 'admin_scope';

export type ParsedScope = { kind: 'all' } | { kind: 'main' } | { kind: 'department'; id: number };

export interface ScopeDepartment {
    id: number;
    name: string;
    slug: string;
}

export type AdminScope =
    | { kind: 'all' }
    | { kind: 'main' }
    | { kind: 'department'; id: number; name: string; slug: string };

/** Cookie value (`all` | `main` | `<id>`) to a scope; anything unrecognised is `all`. */
export function parseScope(cookieValue: string | null | undefined): ParsedScope {
    const value = cookieValue?.trim();
    if (value === 'main') return { kind: 'main' };
    if (value && /^[1-9]\d{0,9}$/.test(value)) return { kind: 'department', id: Number(value) };
    return { kind: 'all' };
}

/**
 * Effective scope for the actor. Superadmins get the requested scope (unknown department ids fall back to
 * `all`); department users are always scoped to their own department and ignore the cookie.
 */
export function resolveScope(actor: Actor, parsed: ParsedScope, departments: readonly ScopeDepartment[]): AdminScope {
    if (!isSuperAdmin(actor)) {
        const own = departments.find((d) => d.id === actor.departmentId);
        return own ? { kind: 'department', id: own.id, name: own.name, slug: own.slug } : { kind: 'all' };
    }
    if (parsed.kind === 'department') {
        const found = departments.find((d) => d.id === parsed.id);
        return found ? { kind: 'department', id: found.id, name: found.name, slug: found.slug } : { kind: 'all' };
    }
    return parsed;
}

/** Prisma `where` fragment for rows having a nullable `departmentId`; spread it into a list query. */
export interface DepartmentWhere {
    departmentId?: number | null;
    OR?: { departmentId: number | null }[];
}

/**
 * The one list filter for (actor, admin scope). Department users always get their own department
 * (the scope is ignored for them, so no scope value can widen or move it); superadmins get what the
 * scope selects (`main` = rows with no department). `includeGeneral` also matches rows with no
 * department (shared download folders); it adds an `OR`, so combine it with other conditions only
 * through `listWhere`.
 */
export function departmentWhere(
    actor: Actor,
    scope: AdminScope,
    { includeGeneral = false }: { includeGeneral?: boolean } = {},
): DepartmentWhere {
    const only = (departmentId: number): DepartmentWhere =>
        includeGeneral ? { OR: [{ departmentId }, { departmentId: null }] } : { departmentId };
    if (!isSuperAdmin(actor)) return only(actor.departmentId ?? -1);
    if (scope.kind === 'main') return { departmentId: null };
    if (scope.kind === 'department') return only(scope.id);
    return {};
}

/**
 * `departmentWhere` plus extra list conditions (search, type, flags), combined with `AND` so none of
 * them, including an `OR` search, can overwrite or widen the actor's restriction. Empty filters are skipped.
 */
export function listWhere<F extends object>(
    actor: Actor,
    scope: AdminScope,
    filters: readonly (F | '' | null | undefined | false)[],
    options: { includeGeneral?: boolean } = {},
): { AND: (DepartmentWhere | F)[] } {
    const extra = filters.filter((f): f is F => !!f && Object.keys(f).length > 0);
    return { AND: [departmentWhere(actor, scope, options), ...extra] };
}

/** Human label used by the switcher and page indicators. */
export function scopeLabel(scope: AdminScope): string {
    return scope.kind === 'all' ? 'All departments' : scope.kind === 'main' ? 'Main page' : scope.name;
}

/** Department id a create form should preselect: the scoped department, otherwise null (General / main page). */
export function scopeDefaultDepartment(scope: AdminScope): number | null {
    return scope.kind === 'department' ? scope.id : null;
}
