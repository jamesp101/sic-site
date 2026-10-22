import { db } from './db';
import { remove } from './storage';

/** How long a presigned upload may wait for `downloads.create` before it can no longer be claimed. */
const CLAIM_TTL_MS = 60 * 60 * 1000;
/**
 * Sweeping starts this long after expiry, so a sweep can never read a row that a claim racing it at
 * the expiry boundary still deletes successfully.
 */
const SWEEP_GRACE_MS = 5 * 60 * 1000;
const SWEEP_BATCH = 50;

/** Records a presigned key as issued to `userId`. */
export async function registerPendingUpload(key: string, userId: number, now = Date.now()): Promise<void> {
    await db.pendingUpload.create({ data: { key, userId, expiresAt: new Date(now + CLAIM_TTL_MS) } });
}

/** Claims an unexpired key issued to `userId`, at most once; false for anyone else's, claimed or expired keys. */
export async function claimPendingUpload(key: string, userId: number, now = Date.now()): Promise<boolean> {
    const { count } = await db.pendingUpload.deleteMany({ where: { key, userId, expiresAt: { gt: new Date(now) } } });
    return count === 1;
}

/** Deletes a batch of long-expired, never-claimed uploads and their stored objects. */
export async function sweepPendingUploads(now = Date.now()): Promise<void> {
    const expired = await db.pendingUpload.findMany({
        where: { expiresAt: { lte: new Date(now - SWEEP_GRACE_MS) } },
        orderBy: { expiresAt: 'asc' },
        take: SWEEP_BATCH,
        select: { id: true, key: true },
    });
    if (expired.length === 0) return;
    for (const row of expired) await remove(row.key);
    await db.pendingUpload.deleteMany({ where: { id: { in: expired.map((row) => row.id) } } });
}
