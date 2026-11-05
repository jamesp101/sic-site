/** Rules for org-chart members that need the database. Free of `astro:*` imports. */
import { wouldCycle } from '../org-tree';
import { db } from './db';
import { RequestError } from './request-error';

/** Parent must be in the same department and must not be the member itself or one of its descendants. */
export async function assertValidParent(
    departmentId: number,
    parentId: number | null | undefined,
    memberId?: number,
): Promise<void> {
    if (parentId == null) return;
    const tree = await db.member.findMany({
        where: { departmentId },
        select: { id: true, parentId: true, order: true },
    });
    if (!tree.some((node) => node.id === parentId)) {
        throw new RequestError('BAD_REQUEST', 'The selected parent does not belong to this department.');
    }
    if (memberId !== undefined && wouldCycle(tree, memberId, parentId)) {
        throw new RequestError('BAD_REQUEST', 'A member cannot report to itself or to one of its own subordinates.');
    }
}
