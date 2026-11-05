import { describe, expect, it } from 'vite-plus/test';
import { createBlock, createDocument, findBlock, serializeDocument } from '@/lib/blocks/document';
import { deleteBlock, failed, type EditResult } from '@/lib/blocks/edit';
import type { Block } from '@/lib/blocks/types';
import { EditorSession } from './session';

function setup(blocks: Block[], initialValue = '') {
    let now = 0;
    const emitted: string[] = [];
    let changes = 0;
    const session: EditorSession = new EditorSession(
        blocks,
        initialValue,
        () => {
            changes++;
            emitted.push(session.value);
        },
        () => now,
    );
    return { session, emitted, advance: (ms: number) => (now += ms), changes: () => changes };
}

function run(session: EditorSession, result: EditResult) {
    if (failed(result)) throw new Error(result.error);
    session.apply(result);
}

const texts = (session: EditorSession) => session.view.blocks.map((block) => Reflect.get(block.props, 'text'));

describe('EditorSession value', () => {
    it('emits the stored input untouched until the first edit', () => {
        const { session } = setup([createBlock('paragraph')], 'legacy *markdown*');
        expect(session.value).toBe('legacy *markdown*');
        session.apply({ blocks: [] });
        expect(session.value).toBe('');
    });

    it('serializes the blocks as a document once edited', () => {
        const paragraph = createBlock('paragraph', { text: 'a' });
        const { session } = setup([paragraph]);
        session.setProps(paragraph.id, { text: 'b' });
        expect(session.value).toBe(serializeDocument(createDocument(session.view.blocks)));
        expect(texts(session)).toEqual(['b']);
    });

    it('undo re-emits the previous value, redo the later one', () => {
        const paragraph = createBlock('paragraph', { text: 'a' });
        const { session, emitted } = setup([paragraph], 'original');
        session.setProps(paragraph.id, { text: 'b' }, false);
        session.undo();
        expect(session.value).toBe('original');
        expect(emitted.at(-1)).toBe('original');
        session.redo();
        expect(emitted.at(-1)).toBe(session.value);
        expect(texts(session)).toEqual(['b']);
    });

    it('undo and redo with nothing to travel to change nothing', () => {
        const { session, changes } = setup([createBlock('paragraph')]);
        session.undo();
        session.redo();
        expect(changes()).toBe(0);
        expect(session.view.canUndo).toBe(false);
        expect(session.view.canRedo).toBe(false);
    });
});

describe('EditorSession selection', () => {
    it('ignores ids that are not in the document', () => {
        const paragraph = createBlock('paragraph');
        const { session } = setup([paragraph]);
        session.select(paragraph.id);
        expect(session.view.selectedId).toBe(paragraph.id);
        session.select('missing');
        expect(session.view.selectedId).toBeNull();
    });

    it('is cleared when an edit removes the selected block, and applied when the edit names one', () => {
        const a = createBlock('paragraph');
        const b = createBlock('paragraph');
        const { session } = setup([a, b]);
        session.select(a.id);
        session.apply({ blocks: [b] });
        expect(session.view.selectedId).toBeNull();
        session.apply({ blocks: [b, a], select: a.id });
        expect(session.view.selectedId).toBe(a.id);
    });

    it('follows a delete to the neighbour and falls back to nothing when undo removes the selection', () => {
        const a = createBlock('paragraph');
        const b = createBlock('paragraph');
        const { session } = setup([a, b]);
        session.select(a.id);
        run(session, deleteBlock(session.view.blocks, a.id));
        expect(session.view.selectedId).toBe(b.id);
        session.undo();
        expect(session.view.blocks).toHaveLength(2);
        expect(session.view.selectedId).toBe(b.id);

        const added = createBlock('divider');
        session.apply({ blocks: [...session.view.blocks, added], select: added.id });
        expect(findBlock(session.view.blocks, added.id)).not.toBeNull();
        session.undo();
        expect(session.view.selectedId).toBeNull();
    });

    it('is cleared by redo when the redone state lacks the selected block', () => {
        const a = createBlock('paragraph');
        const b = createBlock('paragraph');
        const { session } = setup([a, b]);
        session.apply({ blocks: [b] });
        session.undo();
        session.select(a.id);
        session.redo();
        expect(session.view.selectedId).toBeNull();
    });
});

describe('EditorSession history', () => {
    it('coalesces rapid edits to the same field of the same block into one undo step', () => {
        const paragraph = createBlock('paragraph', { text: 'a' });
        const { session, advance } = setup([paragraph]);
        for (const text of ['ab', 'abc', 'abcd']) {
            session.setProps(paragraph.id, { text });
            advance(100);
        }
        expect(texts(session)).toEqual(['abcd']);
        session.undo();
        expect(texts(session)).toEqual(['a']);
        expect(session.view.canUndo).toBe(false);
    });

    it('keeps separate steps after the coalescing window, for other fields, or when not coalescing', () => {
        const paragraph = createBlock('paragraph', { text: 'a' });
        const { session, advance } = setup([paragraph]);
        session.setProps(paragraph.id, { text: 'b' });
        advance(5000);
        session.setProps(paragraph.id, { text: 'c' });
        session.setProps(paragraph.id, { tone: 'muted' });
        session.setProps(paragraph.id, { text: 'd' }, false);
        session.setProps(paragraph.id, { text: 'e' }, false);
        session.undo();
        expect(texts(session)).toEqual(['d']);
        session.undo(); // tone
        session.undo(); // c
        session.undo(); // b
        expect(texts(session)).toEqual(['b']);
        session.undo();
        expect(texts(session)).toEqual(['a']);
    });

    it('records no step for an edit that changes nothing', () => {
        const paragraph = createBlock('paragraph');
        const { session, changes } = setup([paragraph]);
        session.apply({ blocks: session.view.blocks });
        expect(session.view.canUndo).toBe(false);
        expect(changes()).toBe(0);
    });

    it('bumps the revision on every document change and on resync, but not on selection', () => {
        const paragraph = createBlock('paragraph');
        const { session } = setup([paragraph]);
        const start = session.view.revision;
        session.select(paragraph.id);
        expect(session.view.revision).toBe(start);
        session.apply({ blocks: [] });
        session.undo();
        session.resync();
        expect(session.view.revision).toBe(start + 3);
    });
});
