/**
 * Optimistic tree-edit session: the one place that owns a tree being edited with instant feedback.
 * Free of `astro:*` and Svelte so it is unit-tested with an in-memory port.
 *
 * - Two trees: `tree` is what the user sees (every edit is applied at once); `confirmed` is the last tree
 *   the server accepted.
 * - Saves go through a queue, one at a time and in the order the edits were made, so overlapping edits
 *   (fast keyboard moves, a rename during a drag save) never reach the server out of order.
 * - A failed save rolls `tree` back to `confirmed` and discards every edit queued behind it; the caller gets
 *   the failure message and announcement text in the {@link EditResult}.
 * - Undo/redo history policy (one for every editor): history rolls back together with the tree. After a
 *   failed save the stacks are exactly what they were at the last confirmed save, so entries of the failed
 *   and discarded edits disappear, earlier entries stay usable, and a rename or other `record: false` edit
 *   never enters history. A new recorded edit clears redo.
 * - Changes made elsewhere and already saved (create, delete, a full form save) enter through
 *   {@link TreeEditSession.adopt}.
 */

/** How the session applies a change to a tree and works out what undoes it. Both must be pure. */
export interface TreeEditOps<T, C> {
    /** The tree after `change`. Never mutates `tree`. */
    apply(tree: T, change: C): T;
    /** The change that restores `tree` (the tree *before* `change`) when applied after `change`. */
    invert(tree: T, change: C): C;
    /** True when `change` would leave `tree` as it is; such an edit is skipped and never saved. */
    isNoop?(tree: T, change: C): boolean;
}

export type SaveOutcome = { ok: true } | { ok: false; message?: string };

/** Persists one change. `confirmed` is the server-confirmed tree the change is applied on. */
export interface TreeEditPort<T, C> {
    save(change: C, confirmed: T): Promise<SaveOutcome>;
}

export type EditResult =
    /** The server accepted the change. */
    | { status: 'saved' }
    /** Nothing to do (no change, or nothing to undo or redo). */
    | { status: 'noop' }
    /** The save failed and the session went back to the last confirmed tree. */
    | { status: 'reverted'; message: string; announcement: string }
    /** An earlier save failed; this edit was rolled back with it and never sent. */
    | { status: 'discarded' };

export interface TreeEditSnapshot<T> {
    /** The tree to draw (optimistic). */
    tree: T;
    /** The last tree the server confirmed. */
    confirmed: T;
    /** A save is in flight or queued. */
    pending: boolean;
    canUndo: boolean;
    canRedo: boolean;
}

export interface TreeEditSession<T, C> {
    snapshot(): TreeEditSnapshot<T>;
    /** Applies `change` now and queues its save. Set `record: false` to keep it out of undo history. */
    edit(change: C, options?: { record?: boolean }): Promise<EditResult>;
    undo(): Promise<EditResult>;
    redo(): Promise<EditResult>;
    /** Resolves once every queued save has finished. */
    settled(): Promise<void>;
    /** Folds an already-saved change into both trees; `resetHistory` drops undo and redo. */
    adopt(change: (tree: T) => T, options?: { resetHistory?: boolean }): void;
}

export interface TreeEditOptions<T, C> {
    tree: T;
    port: TreeEditPort<T, C>;
    ops: TreeEditOps<T, C>;
    /** Called after every state change. */
    onChange?: (snapshot: TreeEditSnapshot<T>) => void;
    /** Message of a failed save when the port gives none. */
    fallbackMessage?: string;
}

interface Entry<C> {
    forward: C;
    back: C;
}
interface History<C> {
    undo: Entry<C>[];
    redo: Entry<C>[];
}

const REVERTED_ANNOUNCEMENT = 'The change could not be saved and was reverted.';

export function createTreeEditSession<T, C>(options: TreeEditOptions<T, C>): TreeEditSession<T, C> {
    const { port, ops, onChange, fallbackMessage = REVERTED_ANNOUNCEMENT } = options;
    let tree = options.tree;
    let confirmed = options.tree;
    let live: History<C> = { undo: [], redo: [] };
    let sure: History<C> = live;
    let generation = 0;
    let inflight = 0;
    let tail: Promise<unknown> = Promise.resolve();

    function snapshot(): TreeEditSnapshot<T> {
        return { tree, confirmed, pending: inflight > 0, canUndo: live.undo.length > 0, canRedo: live.redo.length > 0 };
    }
    const emit = () => onChange?.(snapshot());

    /** Queues the save of `change`; `step` is its history effect, applied to `sure` once it is confirmed. */
    function enqueue(change: C, step: (history: History<C>) => History<C>): Promise<EditResult> {
        const mine = generation;
        inflight += 1;
        const run = tail.then(async (): Promise<EditResult> => {
            if (mine !== generation) return { status: 'discarded' };
            let outcome: SaveOutcome;
            try {
                outcome = await port.save(change, confirmed);
            } catch {
                outcome = { ok: false };
            }
            if (!outcome.ok) {
                generation += 1;
                tree = confirmed;
                live = sure;
                return {
                    status: 'reverted',
                    message: outcome.message || fallbackMessage,
                    announcement: REVERTED_ANNOUNCEMENT,
                };
            }
            confirmed = ops.apply(confirmed, change);
            sure = step(sure);
            return { status: 'saved' };
        });
        tail = run;
        return run.finally(() => {
            inflight -= 1;
            emit();
        });
    }

    function edit(change: C, { record = true }: { record?: boolean } = {}): Promise<EditResult> {
        if (ops.isNoop?.(tree, change)) return Promise.resolve({ status: 'noop' });
        const entry: Entry<C> | null = record ? { forward: change, back: ops.invert(tree, change) } : null;
        const step = (history: History<C>): History<C> =>
            entry ? { undo: [...history.undo, entry], redo: [] } : history;
        tree = ops.apply(tree, change);
        live = step(live);
        const saved = enqueue(change, step);
        emit();
        return saved;
    }

    function travel(direction: 'undo' | 'redo'): Promise<EditResult> {
        const entry = (direction === 'undo' ? live.undo : live.redo).at(-1);
        if (!entry) return Promise.resolve({ status: 'noop' });
        const change = direction === 'undo' ? entry.back : entry.forward;
        const step = (history: History<C>): History<C> =>
            direction === 'undo'
                ? { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] }
                : { undo: [...history.undo, entry], redo: history.redo.slice(0, -1) };
        tree = ops.apply(tree, change);
        live = step(live);
        const saved = enqueue(change, step);
        emit();
        return saved;
    }

    return {
        snapshot,
        edit,
        undo: () => travel('undo'),
        redo: () => travel('redo'),
        settled: async () => {
            await tail;
        },
        adopt(change, { resetHistory = false } = {}) {
            tree = change(tree);
            confirmed = change(confirmed);
            if (resetHistory) {
                live = { undo: [], redo: [] };
                sure = live;
            }
            emit();
        },
    };
}
