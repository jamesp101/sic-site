import { describe, expect, it } from 'vite-plus/test';
import {
    createOrgChartSession,
    type CreateOutcome,
    type MemberValues,
    type OrgChartPort,
    type UpdateOutcome,
} from './org-chart-session';
import type { OrgMember } from './org-tree';

const member = (id: number, parentId: number | null, order: number, name = `M${id}`): OrgMember => ({
    id,
    name,
    role: 'Role',
    parentId,
    order,
    imageUrl: null,
});

//  1
//  ├─ 2
//  └─ 3
const initial = [member(1, null, 1), member(2, 1, 1), member(3, 1, 2)];

const values = (over: Partial<MemberValues> = {}): MemberValues => ({
    name: 'New',
    role: 'Lead',
    parentId: 1,
    order: 3,
    image: null,
    ...over,
});

/** In-memory server: each call records itself and succeeds unless its kind is in `failing`. */
function memoryPort(failing: string[] = []) {
    const calls: string[] = [];
    const port: OrgChartPort = {
        async reorder(placements) {
            calls.push(`reorder:${placements.map((p) => p.id).join(',')}`);
            return failing.includes('reorder') ? { ok: false, message: 'No reorder.' } : { ok: true };
        },
        async rename(current, name) {
            calls.push(`rename:${current.id}:${name}`);
            return failing.includes('rename') ? { ok: false, message: 'No rename.' } : { ok: true };
        },
        async create(): Promise<CreateOutcome> {
            calls.push('create');
            return failing.includes('create')
                ? { ok: false, failure: { fields: { name: 'Taken.' }, message: '' } }
                : { ok: true, id: 9, order: 3, imageUrl: '/new.png' };
        },
        async update(id): Promise<UpdateOutcome> {
            calls.push(`update:${id}`);
            return failing.includes('update')
                ? { ok: false, failure: { fields: {}, message: 'No update.' } }
                : { ok: true, imageUrl: '/photo.png' };
        },
        async remove(id) {
            calls.push(`remove:${id}`);
            return failing.includes('remove') ? { ok: false, message: 'No delete.' } : { ok: true };
        },
    };
    return { port, calls };
}

function start(failing: string[] = []) {
    const server = memoryPort(failing);
    const session = createOrgChartSession({ members: initial, port: server.port });
    return { session, ...server };
}

describe('create', () => {
    it('adopts the new member in the drawn and confirmed trees', async () => {
        const { session } = start();
        const result = await session.create(values());
        const created = { id: 9, name: 'New', role: 'Lead', parentId: 1, order: 3, imageUrl: '/new.png' };
        expect(result).toEqual({ ok: true, member: created });
        expect(session.snapshot().tree).toEqual([...initial, created]);
        expect(session.snapshot().confirmed).toEqual([...initial, created]);
    });

    it('waits for queued edits before creating', async () => {
        const { session, calls } = start();
        void session.edit({ kind: 'rename', id: 2, name: 'Ada' }, { record: false });
        await session.create(values());
        expect(calls).toEqual(['rename:2:Ada', 'create']);
    });

    it('returns the failure and leaves the tree as it was', async () => {
        const { session } = start(['create']);
        const result = await session.create(values());
        expect(result).toEqual({ ok: false, failure: { fields: { name: 'Taken.' }, message: '' } });
        expect(session.snapshot().tree).toEqual(initial);
    });
});

describe('update', () => {
    it('folds the saved values and the new image into both trees', async () => {
        const { session } = start();
        const result = await session.update(2, values({ name: 'Ada', role: 'CTO', parentId: 1, order: 1 }));
        expect(result).toEqual({ ok: true });
        const updated = { id: 2, name: 'Ada', role: 'CTO', parentId: 1, order: 1, imageUrl: '/photo.png' };
        expect(session.snapshot().tree).toEqual([initial[0], updated, initial[2]]);
        expect(session.snapshot().confirmed).toEqual([initial[0], updated, initial[2]]);
    });

    it('keeps undo history when only text changed, and drops it when the member moved', async () => {
        const text = start();
        await text.session.edit({
            kind: 'place',
            placements: [
                { id: 3, parentId: 1, order: 1 },
                { id: 2, parentId: 1, order: 2 },
            ],
        });
        await text.session.update(1, values({ name: 'Boss', parentId: null, order: 1 }));
        expect(text.session.snapshot().canUndo).toBe(true);

        const moved = start();
        await moved.session.edit({
            kind: 'place',
            placements: [
                { id: 3, parentId: 1, order: 1 },
                { id: 2, parentId: 1, order: 2 },
            ],
        });
        await moved.session.update(1, values({ name: 'Boss', parentId: null, order: 5 }));
        expect(moved.session.snapshot().canUndo).toBe(false);
    });

    it('refuses a member that is gone, without calling the server', async () => {
        const { session, calls } = start();
        const result = await session.update(99, values());
        expect(result).toMatchObject({ ok: false, failure: { message: 'This member no longer exists.' } });
        expect(calls).toEqual([]);
    });

    it('returns the failure and leaves the tree as it was', async () => {
        const { session } = start(['update']);
        const result = await session.update(2, values({ name: 'Ada' }));
        expect(result).toEqual({ ok: false, failure: { fields: {}, message: 'No update.' } });
        expect(session.snapshot().tree).toEqual(initial);
    });
});

describe('remove', () => {
    it('removes the member, moves its reports up and clears undo history', async () => {
        const { session } = start();
        await session.edit({
            kind: 'place',
            placements: [
                { id: 3, parentId: 1, order: 1 },
                { id: 2, parentId: 1, order: 2 },
            ],
        });
        const result = await session.remove(1);
        expect(result).toEqual({ ok: true });
        expect(session.snapshot().tree.map((m) => [m.id, m.parentId])).toEqual([
            [2, null],
            [3, null],
        ]);
        expect(session.snapshot().canUndo).toBe(false);
    });

    it('a failed delete changes nothing and reports the server message', async () => {
        const { session } = start(['remove']);
        const result = await session.remove(2);
        expect(result).toEqual({ ok: false, message: 'No delete.' });
        expect(session.snapshot().tree).toEqual(initial);
        expect(session.snapshot().confirmed).toEqual(initial);
    });

    it('falls back to a generic message when the server gives none', async () => {
        const server = memoryPort();
        server.port.remove = async () => ({ ok: false });
        const session = createOrgChartSession({ members: initial, port: server.port });
        expect(await session.remove(2)).toEqual({ ok: false, message: 'The member could not be deleted.' });
    });
});

describe('moves and renames', () => {
    it('a failed reorder rolls the chart back and reports it', async () => {
        const { session } = start(['reorder']);
        const result = await session.edit({
            kind: 'place',
            placements: [
                { id: 3, parentId: 1, order: 1 },
                { id: 2, parentId: 1, order: 2 },
            ],
        });
        expect(result).toMatchObject({ status: 'reverted', message: 'No reorder.' });
        expect(session.snapshot().tree).toEqual(initial);
    });

    it('a rename is saved against the confirmed member', async () => {
        const { session, calls } = start();
        const result = await session.edit({ kind: 'rename', id: 2, name: 'Ada' }, { record: false });
        expect(result).toEqual({ status: 'saved' });
        expect(calls).toEqual(['rename:2:Ada']);
        expect(session.snapshot().tree.find((m) => m.id === 2)?.name).toBe('Ada');
    });

    it('renaming a member that is gone does nothing', async () => {
        const { session } = start();
        const result = await session.edit({ kind: 'rename', id: 99, name: 'Ghost' }, { record: false });
        expect(result).toEqual({ status: 'noop' });
    });
});
