import { db } from './db';

/** How long a key issued for a browser upload (Download or video) may wait to be claimed before it can no longer be. */
const CLAIM_TTL_MS = 60 * 60 * 1000;
/**
 * Sweeping starts this long after expiry, so a sweep can never read a row that a claim racing it at
 * the expiry boundary still deletes successfully.
 */
const SWEEP_GRACE_MS = 5 * 60 * 1000;

/** Records a presigned key as issued to `userId`. */
export async function registerPendingUpload(key: string, userId: number, now = Date.now()): Promise<void> {
    await db.pendingUpload.create({ data: { key, userId, expiresAt: new Date(now + CLAIM_TTL_MS) } });
}

/** Claims an unexpired key issued to `userId`, at most once; false for anyone else's, claimed or expired keys. */
export async function claimPendingUpload(key: string, userId: number, now = Date.now()): Promise<boolean> {
    const { count } = await db.pendingUpload.deleteMany({ where: { key, userId, expiresAt: { gt: new Date(now) } } });
    return count === 1;
}

/** Rows that expired at or before this instant are swept. */
export function pendingSweepCutoff(now = Date.now()): Date {
    return new Date(now - SWEEP_GRACE_MS);
}

/**
 * Deletes expired pending-upload rows (past the sweep grace) and returns how many. Stored objects are
 * never touched: a key that was never completed can still be referenced by content, so only the
 * orphan cleanup (`storage-cleanup.ts`: unreferenced and older than its grace) deletes files.
 */
export async function sweepPendingUploads(now = Date.now()): Promise<number> {
    const { count } = await db.pendingUpload.deleteMany({ where: { expiresAt: { lte: pendingSweepCutoff(now) } } });
    return count;
}

/** Expired rows a sweep would remove (past the sweep grace), without removing them. */
export async function countExpiredPendingUploads(now = Date.now()): Promise<number> {
    return db.pendingUpload.count({ where: { expiresAt: { lte: pendingSweepCutoff(now) } } });
}

/** True when `key` is an unexpired, unclaimed upload issued to `userId`; does not consume it. */
export async function ownsPendingUpload(key: string, userId: number, now = Date.now()): Promise<boolean> {
    const count = await db.pendingUpload.count({ where: { key, userId, expiresAt: { gt: new Date(now) } } });
    return count > 0;
}
