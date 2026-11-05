/**
 * Rules about the set of Users that no single action owns. Free of `astro:*` imports.
 *
 * Last Superadmin: every path that can remove one (deleting a User, demoting one) runs its check and its
 * write in ONE `superadminTransaction`. That transaction is `Serializable`, the one isolation level Prisma
 * offers on MySQL/MariaDB, PostgreSQL and SQLite alike: two concurrent removals that both counted "another
 * Superadmin exists" cannot both commit, the database aborts one with a serialization failure or deadlock
 * (Prisma `P2034`) and it reaches the user as a 409 "try again" instead of a 500. No row locks or
 * provider-specific SQL, so it behaves the same everywhere. (SQLite runs one writer at a time, so there the
 * level changes nothing and a real concurrency test would prove nothing; the tests cover the shared
 * transaction and the sequential cases.)
 */
import type { Prisma } from '../../generated/prisma/client';
import { db } from './db';
import { RequestError } from './request-error';
import { deleteWithFiles } from './stored-files';

type Tx = Prisma.TransactionClient;

/** Prisma's "write conflict or deadlock" code, raised for serialization failures on every provider. */
const WRITE_CONFLICT = 'P2034';

/**
 * Runs `run` in a Serializable transaction. A serialization failure/deadlock becomes a 409
 * `RequestError`; anything else, including a `RequestError` from `run`, passes through.
 */
export async function superadminTransaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
    try {
        return await db.$transaction(run, { isolationLevel: 'Serializable' });
    } catch (error) {
        if ((error as { code?: unknown } | null)?.code === WRITE_CONFLICT) {
            throw new RequestError('CONFLICT', 'Another change happened at the same time. Try again.');
        }
        throw error;
    }
}

/** True when `userId` is a Superadmin and no other Superadmin exists. */
async function isLastSuperadmin(tx: Tx, userId: number): Promise<boolean> {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (target?.role !== 'superadmin') return false;
    return (await tx.user.count({ where: { role: 'superadmin', NOT: { id: userId } } })) === 0;
}

/** Throws FORBIDDEN when deleting `userId` would remove the last Superadmin. Call inside `superadminTransaction`. */
export async function assertUserDeletable(tx: Tx, userId: number): Promise<void> {
    if (await isLastSuperadmin(tx, userId)) {
        throw new RequestError('FORBIDDEN', 'The last superadmin account cannot be deleted.');
    }
}

/** Throws FORBIDDEN when changing `userId` to a department user would remove the last Superadmin. Call inside `superadminTransaction`. */
export async function assertUserDemotable(tx: Tx, userId: number): Promise<void> {
    if (await isLastSuperadmin(tx, userId)) {
        throw new RequestError('FORBIDDEN', 'The last superadmin cannot be changed to a department user.');
    }
}

/**
 * Deletes a User (sessions and accounts cascade) and, after the commit, the files they own: Highlight
 * images of their posts and their downloads. The last-Superadmin check and the delete share one
 * transaction. NOT_FOUND when the User does not exist.
 */
export async function deleteUserWithFiles(userId: number): Promise<void> {
    const owned = await db.user.findUnique({
        where: { id: userId },
        select: {
            posts: { select: { highlightImagePath: true } },
            downloads: { select: { filePath: true } },
        },
    });
    if (!owned) throw new RequestError('NOT_FOUND');
    await deleteWithFiles(
        () =>
            superadminTransaction(async (tx) => {
                await assertUserDeletable(tx, userId);
                await tx.user.delete({ where: { id: userId } });
            }),
        [
            ...owned.posts.map((post) => post.highlightImagePath),
            ...owned.downloads.map((download) => download.filePath),
        ],
    );
}
