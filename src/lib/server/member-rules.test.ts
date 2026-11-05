import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { db } = await import('./db');
const { assertValidParent } = await import('./member-rules');

afterAll(closeTestDb);
beforeEach(async () => {
    await db.member.deleteMany();
    await db.department.deleteMany();
});

const department = (name: string) => db.department.create({ data: { name, slug: name.toLowerCase() } });
const member = (departmentId: number, name: string, parentId: number | null = null) =>
    db.member.create({ data: { departmentId, name, role: 'Role', order: 0, parentId } });

describe('assertValidParent (org-chart members)', () => {
    it('accepts no parent and a member of the same department', async () => {
        const cit = await department('CIT');
        const boss = await member(cit.id, 'Boss');
        await expect(assertValidParent(cit.id, null)).resolves.toBeUndefined();
        await expect(assertValidParent(cit.id, boss.id)).resolves.toBeUndefined();
    });

    it("rejects another department's member and a missing one", async () => {
        const cit = await department('CIT');
        const cba = await department('CBA');
        const stranger = await member(cba.id, 'Stranger');
        await expect(assertValidParent(cit.id, stranger.id)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        await expect(assertValidParent(cit.id, 9999)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects a parent that is the member or one of its subordinates', async () => {
        const cit = await department('CIT');
        const boss = await member(cit.id, 'Boss');
        const report = await member(cit.id, 'Report', boss.id);
        await expect(assertValidParent(cit.id, boss.id, boss.id)).rejects.toThrow(/itself or to one of/);
        await expect(assertValidParent(cit.id, report.id, boss.id)).rejects.toThrow(/subordinates/);
        await expect(assertValidParent(cit.id, boss.id, report.id)).resolves.toBeUndefined();
    });
});
