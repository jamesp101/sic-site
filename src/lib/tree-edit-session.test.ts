import { describe, expect, it } from 'vite-plus/test';
import {
    createTreeEditSession,
    type SaveOutcome,
    type TreeEditOps,
    type TreeEditPort,
    type TreeEditSnapshot,
} from './tree-edit-session';

/** A "tree" of letters; a change replaces it wholesale, so history and rollback are easy to read. */
type Letters = string[];
type SetTo = { to: Letters };

const ops: TreeEditOps<Letters, SetTo> = {
    apply: (_tree, change) => change.to,
    invert: (tree) => ({ to: tree }),
    isNoop: (tree, change) => tree.join('') === change.to.join(''),
};

/** In-memory port: records the order of saves and fails the ones whose index is in `failing`. */
function memoryPort(failing: number[] = []) {
    const saved: string[] = [];
    let running = 0;
    let overlapped = false;
    const port: TreeEditPort<Letters, SetTo> = {
        async save(change) {
            running += 1;
            overlapped ||= running > 1;
            const index = saved.length;
            saved.push(change.to.join(''));
            await Promise.resolve();
            running -= 1;
            const outcome: SaveOutcome = failing.includes(index) ? { ok: false, message: 'Refused.' } : { ok: true };
            return outcome;
        },
    };
    return { port, saved, overlapped: () => overlapped };
}

function start(initial: Letters, failing: number[] = []) {
    const memory = memoryPort(failing);
    const snapshots: TreeEditSnapshot<Letters>[] = [];
    const session = createTreeEditSession({
        tree: initial,
        port: memory.port,
        ops,
        onChange: (s) => snapshots.push(s),
    });
    return { session, memory, snapshots };
}

const tree = (session: { snapshot(): TreeEditSnapshot<Letters> }) => session.snapshot().tree.join('');

describe('tree-edit session', () => {
    it('shows an edit at once and confirms it once saved', async () => {
        const { session } = start(['a', 'b']);
        const pending = session.edit({ to: ['b', 'a'] });
        expect(tree(session)).toBe('ba');
        expect(session.snapshot().confirmed.join('')).toBe('ab');
        expect(session.snapshot().pending).toBe(true);
        expect(await pending).toEqual({ status: 'saved' });
        expect(session.snapshot().confirmed.join('')).toBe('ba');
        expect(session.snapshot().pending).toBe(false);
    });

    it('skips an edit that changes nothing', async () => {
        const { session, memory } = start(['a', 'b']);
        expect(await session.edit({ to: ['a', 'b'] })).toEqual({ status: 'noop' });
        expect(memory.saved).toEqual([]);
        expect(session.snapshot().canUndo).toBe(false);
    });

    it('keeps the save order when edits overlap', async () => {
        const { session, memory } = start(['a', 'b', 'c']);
        const results = await Promise.all([
            session.edit({ to: ['b', 'a', 'c'] }),
            session.edit({ to: ['b', 'c', 'a'] }),
            session.edit({ to: ['c', 'b', 'a'] }),
        ]);
        expect(results.map((r) => r.status)).toEqual(['saved', 'saved', 'saved']);
        expect(memory.saved).toEqual(['bac', 'bca', 'cba']);
        expect(memory.overlapped()).toBe(false);
        expect(session.snapshot().confirmed.join('')).toBe('cba');
    });

    it('rolls back to the last confirmed tree when a save fails mid-queue, discarding what was queued behind it', async () => {
        const { session, memory } = start(['a', 'b', 'c'], [1]);
        const first = session.edit({ to: ['b', 'a', 'c'] });
        const second = session.edit({ to: ['b', 'c', 'a'] });
        const third = session.edit({ to: ['c', 'b', 'a'] });
        expect(tree(session)).toBe('cba');

        expect(await first).toEqual({ status: 'saved' });
        expect(await second).toEqual({
            status: 'reverted',
            message: 'Refused.',
            announcement: 'The change could not be saved and was reverted.',
        });
        expect(await third).toEqual({ status: 'discarded' });

        expect(memory.saved).toEqual(['bac', 'bca']);
        expect(tree(session)).toBe('bac');
        expect(session.snapshot().confirmed.join('')).toBe('bac');
        expect(session.snapshot().pending).toBe(false);
    });

    it('uses the fallback message when the port gives none, and survives a port that throws', async () => {
        const session = createTreeEditSession({
            tree: ['a', 'b'],
            port: {
                save: async () => {
                    throw new Error('network');
                },
            },
            ops,
            fallbackMessage: 'Not saved.',
        });
        const result = await session.edit({ to: ['b', 'a'] });
        expect(result).toMatchObject({ status: 'reverted', message: 'Not saved.' });
        expect(tree(session)).toBe('ab');
    });

    it('accepts new edits after a rollback', async () => {
        const { session, memory } = start(['a', 'b'], [0]);
        expect((await session.edit({ to: ['b', 'a'] })).status).toBe('reverted');
        expect((await session.edit({ to: ['a', 'b', 'c'] })).status).toBe('saved');
        expect(memory.saved).toEqual(['ba', 'abc']);
        expect(tree(session)).toBe('abc');
    });

    it('undoes and redoes through the save queue', async () => {
        const { session, memory } = start(['a', 'b', 'c']);
        await session.edit({ to: ['b', 'a', 'c'] });
        await session.edit({ to: ['c', 'b', 'a'] });

        expect(await session.undo()).toEqual({ status: 'saved' });
        expect(tree(session)).toBe('bac');
        expect(session.snapshot()).toMatchObject({ canUndo: true, canRedo: true });
        expect(await session.undo()).toEqual({ status: 'saved' });
        expect(tree(session)).toBe('abc');
        expect(session.snapshot().canUndo).toBe(false);
        expect(await session.undo()).toEqual({ status: 'noop' });

        expect(await session.redo()).toEqual({ status: 'saved' });
        expect(tree(session)).toBe('bac');
        expect(memory.saved).toEqual(['bac', 'cba', 'bac', 'abc', 'bac']);
    });

    it('clears redo when a new edit is made', async () => {
        const { session } = start(['a', 'b', 'c']);
        await session.edit({ to: ['b', 'a', 'c'] });
        await session.undo();
        expect(session.snapshot().canRedo).toBe(true);

        await session.edit({ to: ['c', 'b', 'a'] });
        expect(session.snapshot().canRedo).toBe(false);
        expect(await session.redo()).toEqual({ status: 'noop' });
        expect(tree(session)).toBe('cba');
    });

    it('keeps history after a rollback: confirmed entries stay undoable, failed ones vanish', async () => {
        const { session } = start(['a', 'b', 'c'], [1]);
        await session.edit({ to: ['b', 'a', 'c'] });
        const failed = session.edit({ to: ['c', 'b', 'a'] });
        expect(session.snapshot().canUndo).toBe(true);
        expect((await failed).status).toBe('reverted');
        expect(tree(session)).toBe('bac');

        // Undo after the rollback goes back to the tree before the confirmed edit, not before the failed one.
        expect(session.snapshot().canUndo).toBe(true);
        expect((await session.undo()).status).toBe('saved');
        expect(tree(session)).toBe('abc');
        expect(session.snapshot().canUndo).toBe(false);
    });

    it('restores redo too when an undo fails to save', async () => {
        const { session } = start(['a', 'b'], [1]);
        await session.edit({ to: ['b', 'a'] });
        expect((await session.undo()).status).toBe('reverted');
        expect(tree(session)).toBe('ba');
        expect(session.snapshot()).toMatchObject({ canUndo: true, canRedo: false });
    });

    it('keeps record:false edits out of history', async () => {
        const { session } = start(['a', 'b']);
        await session.edit({ to: ['a', 'b', 'c'] }, { record: false });
        expect(session.snapshot()).toMatchObject({ canUndo: false, canRedo: false });
    });

    it('adopts saved changes into both trees and can drop history', async () => {
        const { session } = start(['a', 'b']);
        await session.edit({ to: ['b', 'a'] });
        session.adopt((letters) => [...letters, 'z']);
        expect(session.snapshot().confirmed.join('')).toBe('baz');
        expect(tree(session)).toBe('baz');
        expect(session.snapshot().canUndo).toBe(true);

        session.adopt((letters) => letters.slice(0, 2), { resetHistory: true });
        expect(session.snapshot()).toMatchObject({ canUndo: false, canRedo: false });
    });

    it('waits for every queued save in settled()', async () => {
        const { session, memory } = start(['a', 'b']);
        void session.edit({ to: ['b', 'a'] });
        void session.edit({ to: ['a', 'b', 'c'] });
        await session.settled();
        expect(memory.saved).toEqual(['ba', 'abc']);
    });
});
