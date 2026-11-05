/**
 * Department-scoped admin access that needs the database: which department a write may target, and
 * loading one row the actor is allowed to touch. The pure rules live in `authz` (`scopeDepartment`,
 * `departmentForWrite`) and `admin-scope` (`departmentWhere`). Free of `astro:*` imports.
 */
import type { CarouselItem, Download, DownloadDirectory, HeroSection, Post } from '@/generated/prisma/client';
import { db } from './db';
import { AuthzError, departmentForWrite, scopeDepartment, scopeOwnDepartment, type Actor } from './authz';
import { RequestError } from './request-error';

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

const loaders: { [K in keyof ScopedRows]: (id: number) => Promise<ScopedRows[K] | null> } = {
    post: (id: number) => db.post.findUnique({ where: { id } }),
    carouselItem: (id: number) => db.carouselItem.findUnique({ where: { id } }),
    heroSection: (id: number) => db.heroSection.findUnique({ where: { id } }),
    download: (id: number) => db.download.findUnique({ where: { id } }),
    downloadDirectory: (id: number) => db.downloadDirectory.findUnique({ where: { id } }),
};

/** Row type of each model `loadScoped` can load. */
interface ScopedRows {
    post: Post;
    carouselItem: CarouselItem;
    heroSection: HeroSection;
    download: Download;
    downloadDirectory: DownloadDirectory;
}

/** Loads one row by id for the actor: NOT_FOUND when missing (or `id` is null), FORBIDDEN for another department's row. */
export async function loadScoped<K extends keyof ScopedRows>(
    actor: Actor,
    model: K,
    id: number | null,
): Promise<ScopedRows[K]> {
    if (id === null) throw new AuthzError('NOT_FOUND');
    const row = (await loaders[model](id)) as ScopedRows[K] | null;
    return scopeDepartment(actor, row);
}

/** Loads a department the actor may manage (their own; any for superadmins): NOT_FOUND / FORBIDDEN otherwise. */
export async function loadOwnDepartment(actor: Actor, id: number | null) {
    if (id === null) throw new AuthzError('NOT_FOUND');
    return scopeOwnDepartment(actor, await db.department.findUnique({ where: { id } }));
}
