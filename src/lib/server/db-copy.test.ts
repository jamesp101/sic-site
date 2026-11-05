import { afterEach, describe, expect, it } from 'vite-plus/test';
import type { PrismaClient } from '../../generated/prisma/client';
import { copyDatabase } from './db-copy';
import { modelDelegate, prismaModels } from './prisma-models';
import { createTestDb, type TestDb } from './test-db';

interface Readable {
    findMany(args: { orderBy: { id: 'asc' } }): Promise<unknown[]>;
}

const opened: TestDb[] = [];
async function fresh() {
    const db = await createTestDb();
    opened.push(db);
    return db.db;
}
afterEach(async () => {
    await Promise.all(opened.splice(0).map((db) => db.close()));
});

async function seed(db: PrismaClient) {
    const dept = await db.department.create({ data: { name: 'College of IT', slug: 'cit' } });
    const user = await db.user.create({
        data: { name: 'Ana', email: 'ana@example.com', role: 'superadmin', emailVerified: true, departmentId: dept.id },
    });
    await db.post.create({
        data: {
            title: 'Hello',
            slug: 'hello',
            content: '{"type":"sic-blocks","version":1,"blocks":[]}',
            searchText: 'hello',
            type: 'event',
            startDate: new Date('2026-11-20T08:00:00Z'),
            departmentId: dept.id,
            userId: user.id,
            isFeatured: true,
        },
    });
    // The manager gets the higher id, so a copy in id order meets the child before its parent.
    const report = await db.member.create({ data: { name: 'Staff', role: 'Staff', departmentId: dept.id } });
    const manager = await db.member.create({ data: { name: 'Dean', role: 'Dean', departmentId: dept.id } });
    await db.member.update({ where: { id: report.id }, data: { parentId: manager.id } });
    await db.rateLimit.create({ data: { key: 'app:x', count: 3, lastRequest: 1_793_888_000_123n } });
    await db.setting.create({ data: { key: 'example', value: 'Welcome' } });
}

describe('copyDatabase', () => {
    it('copies every row of every model unchanged, ids and self-references included', async () => {
        const source = await fresh();
        const target = await fresh();
        await seed(source);

        const report = await copyDatabase(source, target, 'sqlite');

        for (const model of prismaModels(source)) {
            const read = (db: object) =>
                modelDelegate<Readable>(db, model.delegate)?.findMany({ orderBy: { id: 'asc' } });
            expect(await read(target), model.name).toEqual(await read(source));
        }
        expect(report.find((row) => row.model === 'Member')?.rows).toBe(2);
        expect(report.reduce((sum, row) => sum + row.rows, 0)).toBe(7);
        // The target keeps allocating ids after the copied ones.
        const next = await target.department.create({ data: { name: 'Next', slug: 'next' } });
        expect(next.id).toBeGreaterThan(1);
    });

    it('refuses to write into a database that already has rows', async () => {
        const source = await fresh();
        const target = await fresh();
        await seed(source);
        await target.setting.create({ data: { key: 'existing', value: '1' } });

        await expect(copyDatabase(source, target, 'sqlite')).rejects.toThrow(/not empty.*Setting/);
        expect(await target.post.count()).toBe(0);
    });
});
