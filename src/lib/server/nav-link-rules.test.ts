import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { db } = await import('./db');
const { assertValidParent } = await import('./nav-link-rules');

afterAll(closeTestDb);
beforeEach(async () => {
    await db.navigationLink.deleteMany();
});

const link = (label: string, parentId: number | null = null) =>
    db.navigationLink.create({ data: { label, url: `/${label}`, order: 0, isActive: true, parentId } });

const message = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return (error as Error).message;
    }
    return undefined;
};

describe('assertValidParent (navigation links)', () => {
    it('accepts no parent and an existing top-level link', async () => {
        const top = await link('top');
        await expect(assertValidParent(null)).resolves.toBeUndefined();
        await expect(assertValidParent(undefined)).resolves.toBeUndefined();
        await expect(assertValidParent(top.id)).resolves.toBeUndefined();
    });

    it('rejects itself, a missing link and a sub-link as parent', async () => {
        const top = await link('top');
        const child = await link('child', top.id);
        expect(await message(assertValidParent(top.id, top.id))).toMatch(/own parent/);
        expect(await message(assertValidParent(9999))).toMatch(/does not exist/);
        expect(await message(assertValidParent(child.id))).toMatch(/top-level/);
    });

    it('rejects turning a link that has sub-links into a sub-link', async () => {
        const top = await link('top');
        await link('child', top.id);
        const other = await link('other');
        expect(await message(assertValidParent(other.id, top.id))).toMatch(/sub-links/);
    });

    it('fails as a BAD_REQUEST RequestError', async () => {
        await expect(assertValidParent(9999)).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
    });
});
