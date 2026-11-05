import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

// `vi.mock` is hoisted above the imports, so the factory loads the harness itself.
vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { db } = await import('./db');
const { claimPendingUpload, ownsPendingUpload, registerPendingUpload, sweepPendingUploads } =
    await import('./pending-uploads');

const HOUR = 60 * 60 * 1000;
let userId: number;

beforeAll(async () => {
    userId = (await db.user.create({ data: { name: 'Owner', email: 'pending@example.test' } })).id;
});
afterAll(closeTestDb);

describe('pending uploads', () => {
    it('is claimed once, by its owner, before it expires', async () => {
        const key = `videos/${'1'.repeat(32)}.mp4`;
        await registerPendingUpload(key, userId);
        expect(await claimPendingUpload(key, userId + 1)).toBe(false);
        expect(await ownsPendingUpload(key, userId)).toBe(true);
        expect(await claimPendingUpload(key, userId)).toBe(true);
        expect(await claimPendingUpload(key, userId)).toBe(false);
    });

    it('cannot be claimed after expiry', async () => {
        const key = `videos/${'2'.repeat(32)}.mp4`;
        const issued = Date.now() - 2 * HOUR;
        await registerPendingUpload(key, userId, issued);
        expect(await ownsPendingUpload(key, userId)).toBe(false);
        expect(await claimPendingUpload(key, userId)).toBe(false);
    });

    it('sweeps long-expired rows and keeps fresh and recently expired ones, returning the count', async () => {
        const old = `videos/${'3'.repeat(32)}.mp4`;
        const recent = `videos/${'4'.repeat(32)}.mp4`;
        const fresh = `videos/${'5'.repeat(32)}.mp4`;
        const now = Date.now();
        await registerPendingUpload(old, userId, now - 3 * HOUR);
        // Expired a minute ago: inside the sweep grace, so a racing claim never reads a swept row.
        await registerPendingUpload(recent, userId, now - HOUR - 60_000);
        await registerPendingUpload(fresh, userId, now);
        const swept = await sweepPendingUploads(now);
        const left = (await db.pendingUpload.findMany({ select: { key: true } })).map((row) => row.key);
        expect(left).not.toContain(old);
        expect(left).toEqual(expect.arrayContaining([recent, fresh]));
        expect(swept).toBeGreaterThanOrEqual(1);
    });
});
