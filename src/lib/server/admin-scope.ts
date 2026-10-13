/**
 * Admin scope: the department context chosen in the sidebar switcher.
 * Free of `astro:*` imports so it is unit-testable. The scope only narrows lists; it is always
 * combined with `departmentFilter(actor)` from authz, which stays authoritative.
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

/** Prisma `where` fragment for rows having a nullable `departmentId`. */
export function scopeWhere(scope: AdminScope): { departmentId?: number | null } {
    if (scope.kind === 'main') return { departmentId: null };
    if (scope.kind === 'department') return { departmentId: scope.id };
    return {};
}

/** Human label used by the switcher and page indicators. */
export function scopeLabel(scope: AdminScope): string {
    return scope.kind === 'all' ? 'All departments' : scope.kind === 'main' ? 'Main page' : scope.name;
}

/** Department id a create form should preselect (null = General / main page, undefined = no preference). */
export function scopeDefaultDepartment(scope: AdminScope): number | null | undefined {
    return scope.kind === 'department' ? scope.id : scope.kind === 'main' ? null : undefined;
}
