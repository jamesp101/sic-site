import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import type { PrismaClient } from '../../generated/prisma/client';
import { cleanupStorage, KeyMatcher } from './storage-cleanup';
import { closeTestDb, openTestDb } from './test-db';
import { createLocalDriver } from './storage/local';
import { createStoredFiles } from './stored-files';

// The rate-limit sweep runs on the same test database the cleanup is given.
vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));
const { sweepExpiredRateLimits } = await import('./rate-limit');

const HOUR = 60 * 60 * 1000;
let db: PrismaClient;
let dir: string;

beforeAll(async () => {
    db = await openTestDb();
    dir = mkdtempSync(path.join(tmpdir(), 'sic-cleanup-'));
});
afterAll(async () => {
    await closeTestDb();
    rmSync(dir, { recursive: true, force: true });
});

function file(key: string, ageHours: number) {
    const full = path.join(dir, key);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'x');
    const when = new Date(Date.now() - ageHours * HOUR);
    utimesSync(full, when, when);
}

const exists = (key: string) => existsSync(path.join(dir, key));

function deps() {
    const driver = createLocalDriver(dir);
    const { discardFiles } = createStoredFiles({
        put: async () => '',
        remove: (key) => driver.delete(key),
    });
    return {
        db,
        driver,
        discard: discardFiles,
        sweepPending: async () => 0,
        sweepRateLimits: sweepExpiredRateLimits,
        countExpiredPending: async () => 0,
        pendingSweepCutoff: (now: number) => new Date(now - 5 * 60 * 1000),
    };
}

describe('KeyMatcher', () => {
    it('finds bare keys and URL forms', () => {
        const hits = new Set<string>();
        new KeyMatcher(['posts/a.webp', 'carousels/b.webp', 'posts/inline/c.webp']).find(
            '![x](/storage/posts/a.webp?v=1) https://cdn.example/sic/carousels/b.webp {"src":"\\/storage\\/posts\\/inline\\/c.webp"}',
            (key) => hits.add(key),
        );
        expect([...hits].sort()).toEqual(['carousels/b.webp', 'posts/a.webp', 'posts/inline/c.webp']);
    });

    it('does not match a longer name that merely ends the same', () => {
        const hits: string[] = [];
        new KeyMatcher(['posts/a.webp']).find('/storage/posts/xa.webp', (key) => hits.push(key));
        expect(hits).toEqual([]);
    });
});

describe('cleanupStorage', () => {
    it('keeps referenced and young files, deletes the rest, and dry-run deletes nothing', async () => {
        file('members/plain.webp', 48);
        file('posts/inline/block.webp', 48);
        file('carousels/layer.webp', 48);
        file('posts/orphan.webp', 48);
        file('posts/young.webp', 1);
        file('posts/stale.webp.abc123.part', 48);

        await db.department.create({ data: { name: 'D', slug: 'd', logoPath: 'members/plain.webp' } });
        const user = await db.user.create({ data: { name: 'U', email: 'u@example.com' } });
        await db.post.create({
            data: {
                title: 'P',
                type: 'article',
                userId: user.id,
                slug: 'p',
                content: JSON.stringify({
                    type: 'sic-blocks',
                    version: 1,
                    blocks: [{ type: 'image', src: '/storage/posts/inline/block.webp' }],
                }),
            },
        });
        await db.carouselItem.create({
            data: {
                imagePath: 'carousels/unlisted.webp',
                overlay: JSON.stringify({ v: 1, layers: [{ type: 'image', src: 'carousels/layer.webp' }] }),
            },
        });

        const expected = ['posts/orphan.webp', 'posts/stale.webp.abc123.part'];

        const dry = await cleanupStorage(deps(), { dryRun: true });
        expect(dry.keys.sort()).toEqual(expected);
        expect(dry.deleted).toBe(2);
        for (const key of [...expected, 'posts/young.webp', 'members/plain.webp']) expect(exists(key)).toBe(true);

        const real = await cleanupStorage(deps());
        expect(real.keys.sort()).toEqual(expected);
        expect(real.bytesFreed).toBe(2);
        expect(real.referenced).toBe(3);
        for (const key of expected) expect(exists(key)).toBe(false);
        for (const key of [
            'posts/young.webp',
            'members/plain.webp',
            'posts/inline/block.webp',
            'carousels/layer.webp',
        ]) {
            expect(exists(key)).toBe(true);
        }
    });

    it('stops at the delete cap and reports what is left', async () => {
        file('posts/o1.webp', 48);
        file('posts/o2.webp', 48);
        file('posts/o3.webp', 48);
        const report = await cleanupStorage(deps(), { maxDeletes: 2 });
        expect(report.deleted).toBe(2);
        expect(report.remaining).toBe(1);
    });

    it('keeps a key issued to a pending direct upload', async () => {
        file('downloads/0123456789abcdef0123456789abcdef.pdf', 48);
        const user = await db.user.findFirstOrThrow();
        await db.pendingUpload.create({
            data: {
                key: 'downloads/0123456789abcdef0123456789abcdef.pdf',
                userId: user.id,
                expiresAt: new Date(Date.now() + HOUR),
            },
        });
        const report = await cleanupStorage(deps(), { dryRun: true });
        expect(report.keys).not.toContain('downloads/0123456789abcdef0123456789abcdef.pdf');
    });

    it('dry run lists a file whose only reference is a pending-upload row a sweep would remove', async () => {
        const key = 'videos/0123456789abcdef0123456789abcdef.mp4';
        file(key, 48);
        const user = await db.user.findFirstOrThrow();
        await db.pendingUpload.create({ data: { key, userId: user.id, expiresAt: new Date(Date.now() - 2 * HOUR) } });
        const report = await cleanupStorage(deps(), { dryRun: true });
        expect(report.keys).toContain(key);
        expect(exists(key)).toBe(true);
    });

    it('keeps a variant while its original is referenced, deletes both together, and deletes a variant without original', async () => {
        file('posts/hl.webp', 48);
        file('posts/hl.w640.webp', 48);
        file('posts/gone.webp', 48);
        file('posts/gone.w640.webp', 48);
        file('posts/solo.w640.webp', 48);
        const user = await db.user.findFirstOrThrow();
        await db.post.create({
            data: {
                title: 'H',
                type: 'article',
                userId: user.id,
                slug: 'hl',
                content: 'x',
                highlightImagePath: 'posts/hl.webp',
            },
        });

        const dry = await cleanupStorage(deps(), { dryRun: true });
        expect(dry.keys).toContain('posts/gone.webp');
        expect(dry.keys).toContain('posts/solo.w640.webp');
        expect(dry.keys).not.toContain('posts/hl.webp');
        expect(dry.keys).not.toContain('posts/hl.w640.webp');
        expect(dry.keys).not.toContain('posts/gone.w640.webp');

        await cleanupStorage(deps());
        for (const key of ['posts/hl.webp', 'posts/hl.w640.webp']) expect(exists(key)).toBe(true);
        for (const key of ['posts/gone.webp', 'posts/gone.w640.webp', 'posts/solo.w640.webp']) {
            expect(exists(key)).toBe(false);
        }
    });

    it('keeps a Slide photo variant (960 px) with its photo and deletes it with an unreferenced one', async () => {
        file('carousels/kept.webp', 48);
        file('carousels/kept.w960.webp', 48);
        file('carousels/gone.webp', 48);
        file('carousels/gone.w960.webp', 48);
        await db.carouselItem.create({ data: { imagePath: 'carousels/kept.webp', order: 1 } });

        const dry = await cleanupStorage(deps(), { dryRun: true });
        expect(dry.keys).toContain('carousels/gone.webp');
        expect(dry.keys).not.toContain('carousels/kept.webp');
        expect(dry.keys).not.toContain('carousels/kept.w960.webp');
        expect(dry.keys).not.toContain('carousels/gone.w960.webp');

        await cleanupStorage(deps());
        for (const key of ['carousels/kept.webp', 'carousels/kept.w960.webp']) expect(exists(key)).toBe(true);
        for (const key of ['carousels/gone.webp', 'carousels/gone.w960.webp']) expect(exists(key)).toBe(false);
    });

    it('keeps a Department logo and a Member portrait variant (128 px) with their originals and deletes them with unreferenced ones', async () => {
        for (const key of ['departments/kept', 'departments/gone', 'members/kept', 'members/gone']) {
            file(`${key}.webp`, 48);
            file(`${key}.w128.webp`, 48);
        }
        const department = await db.department.create({
            data: { name: 'Cleanup', slug: 'cleanup', logoPath: 'departments/kept.webp' },
        });
        await db.member.create({
            data: { name: 'M', role: 'R', departmentId: department.id, imagePath: 'members/kept.webp' },
        });

        const dry = await cleanupStorage(deps(), { dryRun: true });
        expect(dry.keys).toEqual(expect.arrayContaining(['departments/gone.webp', 'members/gone.webp']));
        for (const key of ['departments/kept', 'members/kept']) {
            expect(dry.keys).not.toContain(`${key}.webp`);
            expect(dry.keys).not.toContain(`${key}.w128.webp`);
        }
        for (const key of ['departments/gone', 'members/gone']) expect(dry.keys).not.toContain(`${key}.w128.webp`);

        await cleanupStorage(deps());
        for (const key of ['departments/kept', 'members/kept']) {
            expect(exists(`${key}.webp`)).toBe(true);
            expect(exists(`${key}.w128.webp`)).toBe(true);
        }
        for (const key of ['departments/gone', 'members/gone']) {
            expect(exists(`${key}.webp`)).toBe(false);
            expect(exists(`${key}.w128.webp`)).toBe(false);
        }
    });

    it('sweeps expired app rate-limit counters, keeps current ones and Better Auth rows, and leaves them alone in a dry run', async () => {
        const now = Date.now();
        await db.rateLimit.createMany({
            data: [
                { key: 'app:contact:expired', count: 5, lastRequest: BigInt(now - 3 * HOUR) },
                { key: 'app:contact:current', count: 5, lastRequest: BigInt(now - 10 * 60 * 1000) },
                { key: '203.0.113.9/sign-in/email', count: 1, lastRequest: BigInt(now - 3 * HOUR) },
            ],
        });
        const keys = async () => (await db.rateLimit.findMany({ select: { key: true } })).map((row) => row.key).sort();

        expect((await cleanupStorage(deps(), { dryRun: true })).rateLimits).toBe(0);
        expect(await keys()).toHaveLength(3);

        expect((await cleanupStorage(deps())).rateLimits).toBe(1);
        expect(await keys()).toEqual(['203.0.113.9/sign-in/email', 'app:contact:current']);
    });
});
