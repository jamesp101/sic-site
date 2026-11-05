/**
 * Department-scoped admin access that needs the database: which department a write may target, and
 * loading one row the actor is allowed to touch. The pure rules live in `authz` (`scopeDepartment`,
 * `departmentForWrite`) and `admin-scope` (`departmentWhere`). Free of `astro:*` imports.
 */
import { z } from 'astro/zod';
import type { CarouselItem, Download, DownloadDirectory, HeroSection, Member, Post } from '@/generated/prisma/client';
import { db } from './db';
import { departmentForWrite, isSuperAdmin, scopeDepartment, scopeOwnDepartment, type Actor } from './authz';
import { RequestError } from './request-error';

/** Department id input of create/update actions: null/absent = main page or General. Declared once for all action schemas. */
export const departmentIdField = z.number().int().nullish();

/** Departments the actor may pick in a form: all for superadmins, otherwise only their own. */
export function departmentOptions(actor: Actor) {
    return db.department.findMany({
        where: isSuperAdmin(actor) ? {} : { id: actor.departmentId ?? -1 },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
    });
}

/** Throws BAD_REQUEST unless the department exists. */
export async function assertDepartmentExists(id: number): Promise<void> {
    const found = await db.department.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new RequestError('BAD_REQUEST', 'The selected department does not exist.');
}

/**
 * Department id to store on a create/update: superadmins choose (null = main page / General), anyone else
 * is forced to their own department (FORBIDDEN without one); a chosen department must exist.
 */
export async function resolveWriteDepartment(
    actor: Actor,
    requested: number | null | undefined,
): Promise<number | null> {
    const departmentId = departmentForWrite(actor, requested);
    if (departmentId !== null) await assertDepartmentExists(departmentId);
    return departmentId;
}

/** Row type of each model `loadScoped` can load. */
interface ScopedRows {
    post: Post;
    carouselItem: CarouselItem;
    heroSection: HeroSection;
    download: Download;
    downloadDirectory: DownloadDirectory;
}

interface Finder<R> {
    one: (id: number) => Promise<R | null>;
    many: (ids: number[]) => Promise<R[]>;
}

const finders: { [K in keyof ScopedRows]: Finder<ScopedRows[K]> } = {
    post: {
        one: (id) => db.post.findUnique({ where: { id } }),
        many: (ids) => db.post.findMany({ where: { id: { in: ids } } }),
    },
    carouselItem: {
        one: (id) => db.carouselItem.findUnique({ where: { id } }),
        many: (ids) => db.carouselItem.findMany({ where: { id: { in: ids } } }),
    },
    heroSection: {
        one: (id) => db.heroSection.findUnique({ where: { id } }),
        many: (ids) => db.heroSection.findMany({ where: { id: { in: ids } } }),
    },
    download: {
        one: (id) => db.download.findUnique({ where: { id } }),
        many: (ids) => db.download.findMany({ where: { id: { in: ids } } }),
    },
    downloadDirectory: {
        one: (id) => db.downloadDirectory.findUnique({ where: { id } }),
        many: (ids) => db.downloadDirectory.findMany({ where: { id: { in: ids } } }),
    },
};

/** Loads one row by id for the actor: NOT_FOUND when missing (or `id` is null), FORBIDDEN for another department's row. */
export async function loadScoped<K extends keyof ScopedRows>(
    actor: Actor,
    model: K,
    id: number | null,
): Promise<ScopedRows[K]> {
    if (id === null) throw new RequestError('NOT_FOUND');
    return scopeDepartment(actor, await finders[model].one(id));
}

/**
 * Loads rows for a batch of distinct ids, returned in `ids` order: NOT_FOUND if any id is missing,
 * FORBIDDEN if any row belongs to another department.
 */
export async function loadScopedMany<K extends keyof ScopedRows>(
    actor: Actor,
    model: K,
    ids: number[],
): Promise<ScopedRows[K][]> {
    const rows = await finders[model].many(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => scopeDepartment(actor, byId.get(id)));
}

/** Loads a department the actor may manage (their own; any for superadmins): NOT_FOUND / FORBIDDEN otherwise. */
export async function loadOwnDepartment(actor: Actor, id: number | null) {
    if (id === null) throw new RequestError('NOT_FOUND');
    return scopeOwnDepartment(actor, await db.department.findUnique({ where: { id } }));
}

/** Loads a member of `departmentId`, which the actor must be allowed to manage: NOT_FOUND / FORBIDDEN otherwise. */
export async function loadMember(actor: Actor, departmentId: number, id: number): Promise<Member> {
    await loadOwnDepartment(actor, departmentId);
    const member = await db.member.findUnique({ where: { id } });
    if (!member || member.departmentId !== departmentId) throw new RequestError('NOT_FOUND');
    return member;
}
