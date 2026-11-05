/**
 * The block editor's editing session: the blocks, their undo history, the selection and the value to
 * store. It is plain TypeScript (no runes, no DOM): the component subscribes with `onchange` and
 * renders `view`, a fresh immutable snapshot after every change.
 *
 * Invariants: the selection always names a block that exists; every document change (edit, undo,
 * redo) bumps `revision` (the Layers list re-syncs on it) and emits the new `value`.
 */
import { createDocument, findBlock, serializeDocument, updateBlock } from '@/lib/blocks/document';
import type { Edit } from '@/lib/blocks/edit';
import type { Block } from '@/lib/blocks/types';
import { History } from './history';

export interface SessionView {
    blocks: Block[];
    selectedId: string | null;
    /** Bumped on every document change and `resync()`. */
    revision: number;
    canUndo: boolean;
    canRedo: boolean;
}

export class EditorSession {
    #blocks: Block[];
    #selectedId: string | null = null;
    #revision = 0;
    #history: History<Block[]>;
    #view: SessionView;

    /**
     * @param initialValue stored content the blocks came from; it is emitted unchanged until the first edit.
     * @param onchange called after every change of `view`; `value` is current by then.
     */
    constructor(
        private readonly initialBlocks: Block[],
        private readonly initialValue: string,
        private readonly onchange: () => void,
        private readonly clock: () => number = Date.now,
    ) {
        this.#blocks = initialBlocks;
        this.#history = new History(initialBlocks);
        this.#view = this.#snapshot();
    }

    get view(): SessionView {
        return this.#view;
    }

    /** Content to store: the untouched input before the first edit, `''` for an empty document, else the JSON document. */
    get value(): string {
        const blocks = this.#blocks;
        if (blocks === this.initialBlocks) return this.initialValue;
        return blocks.length ? serializeDocument(createDocument(blocks)) : '';
    }

    /** Selects a block; an unknown id clears the selection. */
    select(id: string | null): void {
        const next = id !== null && findBlock(this.#blocks, id) ? id : null;
        if (next === this.#selectedId) return;
        this.#selectedId = next;
        this.#publish();
    }

    /** Applies an edit as one undo step (`key`: consecutive edits with the same key within a short window merge). */
    apply(edit: Edit, key: string | null = null): void {
        if (edit.blocks === this.#blocks) return;
        this.#history.push(edit.blocks, key, this.clock());
        this.#commit(edit.blocks, edit.select);
    }

    /** Edits a block's properties; typing in the same fields of the same block coalesces into one step. */
    setProps(id: string, patch: Record<string, unknown>, coalesce = true): void {
        const key = coalesce ? `props:${id}:${Object.keys(patch).join(',')}` : null;
        this.apply({ blocks: updateBlock(this.#blocks, id, patch) }, key);
    }

    undo(): void {
        this.#travel(this.#history.undo());
    }

    redo(): void {
        this.#travel(this.#history.redo());
    }

    /** Makes the Layers list rebuild from the blocks (e.g. after a rejected drop). */
    resync(): void {
        this.#revision++;
        this.#publish();
    }

    #travel(snapshot: Block[] | null): void {
        if (snapshot) this.#commit(snapshot);
    }

    #commit(blocks: Block[], select?: string | null): void {
        this.#blocks = blocks;
        this.#revision++;
        if (select !== undefined) this.#selectedId = select;
        if (this.#selectedId !== null && !findBlock(blocks, this.#selectedId)) this.#selectedId = null;
        this.#publish();
    }

    #snapshot(): SessionView {
        return {
            blocks: this.#blocks,
            selectedId: this.#selectedId,
            revision: this.#revision,
            canUndo: this.#history.canUndo,
            canRedo: this.#history.canRedo,
        };
    }

    #publish(): void {
        this.#view = this.#snapshot();
        this.onchange();
    }
}
