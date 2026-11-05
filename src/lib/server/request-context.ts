/**
 * The request's identity, in one place: the session's User (as `Astro.locals.user`), the session itself and, on
 * Admin-scoped routes, the Admin scope with the Departments the switcher offers. The middleware only assigns the
 * result. Free of `astro:*` imports.
 */
import { parseScope, resolveScope, SCOPE_COOKIE, type AdminScope } from './admin-scope';
import { getSession } from './auth-session';
import { isSuperAdmin } from './authz';
import { db } from './db';

export interface RequestUser {
    id: number;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string;
    departmentId: number | null;
}

export interface RequestContext {
    user: RequestUser | null;
    session: { id: string | number; expiresAt: Date; createdAt: Date } | null;
    /** Always `all` unless the route is Admin-scoped and a User is signed in. */
    adminScope: AdminScope;
    /** The Departments the scope switcher lists; empty unless the route is Admin-scoped and a User is signed in. */
    adminDepartments: { id: number; name: string; slug: string; logoPath: string | null }[];
}

/** Nobody signed in (also what static assets get: they never read the session). */
export const ANONYMOUS_CONTEXT: RequestContext = {
    user: null,
    session: null,
    adminScope: { kind: 'all' },
    adminDepartments: [],
};

function cookieValue(headers: Headers, name: string): string | undefined {
    for (const part of (headers.get('cookie') ?? '').split(';')) {
        const separator = part.indexOf('=');
        if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
        const raw = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return undefined;
}

/**
 * Reads the session named by the request's cookie and, when `scoped` (a `/dashboard`, `/admin` or `/settings`
 * route), validates the `admin_scope` cookie against the Departments: unknown ids fall back to `all`, a Department
 * user is pinned to their own Department and ignores the cookie, and only a Superadmin gets the full switcher list.
 */
export async function resolveRequestContext(
    headers: Headers,
    { scoped }: { scoped: boolean },
): Promise<RequestContext> {
    const found = await getSession(headers);
    if (!found) return ANONYMOUS_CONTEXT;

    const user: RequestUser = {
        id: Number(found.user.id),
        name: found.user.name,
        email: found.user.email,
        emailVerified: found.user.emailVerified,
        role: (found.user.role as string | undefined) ?? 'department_user',
        departmentId: found.user.departmentId == null ? null : Number(found.user.departmentId),
    };
    if (!scoped) return { ...ANONYMOUS_CONTEXT, user, session: found.session };

    const adminDepartments = await db.department.findMany({
        where: isSuperAdmin(user) ? {} : { id: user.departmentId ?? -1 },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, logoPath: true },
    });
    return {
        user,
        session: found.session,
        adminScope: resolveScope(user, parseScope(cookieValue(headers, SCOPE_COOKIE)), adminDepartments),
        adminDepartments,
    };
}
