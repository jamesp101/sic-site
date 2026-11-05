/**
 * Authorization rules. Free of `astro:*` imports so it is unit-testable;
 * failures are `RequestError`s that the entry-point adapters turn into ActionError / HTTP status.
 */
import { RequestError } from './request-error';

export type Role = 'superadmin' | 'department_user';

export interface Actor {
    id: number;
    role: string;
    departmentId: number | null;
}

export function isSuperAdmin(actor: Actor | null | undefined): boolean {
    return actor?.role === 'superadmin';
}

export function requireUser<T extends Actor>(actor: T | null | undefined): T {
    if (!actor) throw new RequestError('UNAUTHORIZED');
    return actor;
}

export function requireSuperAdmin<T extends Actor>(actor: T | null | undefined): T {
    const user = requireUser(actor);
    if (!isSuperAdmin(user)) throw new RequestError('FORBIDDEN');
    return user;
}

/**
 * Department users may only touch rows of their own department. Throws NOT_FOUND
 * for a missing row and FORBIDDEN for another department's row.
 */
export function scopeDepartment<R extends { departmentId: number | null }>(actor: Actor, row: R | null | undefined): R {
    if (!row) throw new RequestError('NOT_FOUND');
    if (isSuperAdmin(actor)) return row;
    if (actor.departmentId === null || row.departmentId !== actor.departmentId) throw new RequestError('FORBIDDEN');
    return row;
}

/** Like `scopeDepartment` for a Department row itself: department users may only touch their own department. */
export function scopeOwnDepartment<R extends { id: number }>(actor: Actor, row: R | null | undefined): R {
    if (!row) throw new RequestError('NOT_FOUND');
    scopeDepartment(actor, { departmentId: row.id });
    return row;
}

/** Department id to store on create: forced to the actor's own department for non-superadmins. */
export function departmentForWrite(actor: Actor, requested: number | null | undefined): number | null {
    if (isSuperAdmin(actor)) return requested ?? null;
    if (actor.departmentId === null) throw new RequestError('FORBIDDEN');
    return actor.departmentId;
}
