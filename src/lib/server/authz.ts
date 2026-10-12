/**
 * Authorization rules. Free of `astro:*` imports so it is unit-testable;
 * callers translate AuthzError into ActionError / HTTP status.
 */
export type Role = 'superadmin' | 'department_user';

export interface Actor {
    id: number;
    role: string;
    departmentId: number | null;
}

export class AuthzError extends Error {
    constructor(
        readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
        message = code === 'UNAUTHORIZED' ? 'Sign in required.' : code === 'FORBIDDEN' ? 'Forbidden.' : 'Not found.',
    ) {
        super(message);
        this.name = 'AuthzError';
    }

    get status(): number {
        return this.code === 'UNAUTHORIZED' ? 401 : this.code === 'FORBIDDEN' ? 403 : 404;
    }
}

export function isSuperAdmin(actor: Actor | null | undefined): boolean {
    return actor?.role === 'superadmin';
}

export function requireUser<T extends Actor>(actor: T | null | undefined): T {
    if (!actor) throw new AuthzError('UNAUTHORIZED');
    return actor;
}

export function requireSuperAdmin<T extends Actor>(actor: T | null | undefined): T {
    const user = requireUser(actor);
    if (!isSuperAdmin(user)) throw new AuthzError('FORBIDDEN');
    return user;
}

/**
 * Department users may only touch rows of their own department. Throws NOT_FOUND
 * for a missing row and FORBIDDEN for another department's row.
 */
export function scopeDepartment<R extends { departmentId: number | null }>(actor: Actor, row: R | null | undefined): R {
    if (!row) throw new AuthzError('NOT_FOUND');
    if (isSuperAdmin(actor)) return row;
    if (actor.departmentId === null || row.departmentId !== actor.departmentId) throw new AuthzError('FORBIDDEN');
    return row;
}

/** Department id to store on create: forced to the actor's own department for non-superadmins. */
export function departmentForWrite(actor: Actor, requested: number | null | undefined): number | null {
    if (isSuperAdmin(actor)) return requested ?? null;
    if (actor.departmentId === null) throw new AuthzError('FORBIDDEN');
    return actor.departmentId;
}

/** Prisma `where` fragment that limits list queries to the actor's department. */
export function departmentFilter(actor: Actor): { departmentId?: number } {
    return isSuperAdmin(actor) ? {} : { departmentId: actor.departmentId ?? -1 };
}
