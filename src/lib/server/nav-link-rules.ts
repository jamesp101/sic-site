/** Rules for navigation links that need the database. Free of `astro:*` imports. */
import { db } from './db';
import { RequestError } from './request-error';

/** Navigation is two levels deep: a parent must be an existing top-level link other than the link itself. */
export async function assertValidParent(parentId: number | null | undefined, selfId?: number): Promise<void> {
    if (parentId == null) return;
    if (parentId === selfId) throw new RequestError('BAD_REQUEST', 'A link cannot be its own parent.');
    const parent = await db.navigationLink.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) throw new RequestError('BAD_REQUEST', 'The selected parent link does not exist.');
    if (parent.parentId !== null) {
        throw new RequestError('BAD_REQUEST', 'Only top-level links can be used as a parent.');
    }
    if (selfId !== undefined && (await db.navigationLink.count({ where: { parentId: selfId } })) > 0) {
        throw new RequestError('BAD_REQUEST', 'A link that has sub-links cannot become a sub-link itself.');
    }
}
