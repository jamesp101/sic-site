import { describe, expect, it } from 'vite-plus/test';
import { NUDGE, NUDGE_BIG } from '@/lib/carousel-editor';
import type { KeyEventLike } from '../shared/keymap-core';
import {
    ariaKeys,
    DESIGNER_SHORTCUTS,
    nudgeDelta,
    resolveDesignerKey,
    type DesignerKeyContext,
} from './designer-keymap';

const ready: DesignerKeyContext = { typing: false, inArea: true, hasSelection: true };
const press = (key: string, mods: Partial<Omit<KeyEventLike, 'key'>> = {}): KeyEventLike => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
});

describe('resolveDesignerKey', () => {
    it('saves with Ctrl+S or Cmd+S, even while typing and with nothing selected', () => {
        const typing = { typing: true, inArea: false, hasSelection: false };
        expect(resolveDesignerKey(press('s', { ctrlKey: true }), ready)).toBe('save');
        expect(resolveDesignerKey(press('S', { metaKey: true }), typing)).toBe('save');
        expect(resolveDesignerKey(press('s'), ready)).toBeNull();
    });

    it('undoes and redoes with Ctrl or Cmd, outside the canvas and without a selection', () => {
        const outside = { typing: false, inArea: false, hasSelection: false };
        expect(resolveDesignerKey(press('z', { ctrlKey: true }), outside)).toBe('undo');
        expect(resolveDesignerKey(press('z', { metaKey: true }), outside)).toBe('undo');
        expect(resolveDesignerKey(press('z', { ctrlKey: true, shiftKey: true }), outside)).toBe('redo');
        expect(resolveDesignerKey(press('Z', { metaKey: true, shiftKey: true }), outside)).toBe('redo');
        expect(resolveDesignerKey(press('y', { ctrlKey: true }), outside)).toBe('redo');
    });

    it('duplicates with Ctrl+D or Cmd+D only when a layer is selected, wherever focus is', () => {
        expect(resolveDesignerKey(press('d', { ctrlKey: true }), { ...ready, inArea: false })).toBe('duplicate');
        expect(resolveDesignerKey(press('d', { metaKey: true }), ready)).toBe('duplicate');
        expect(resolveDesignerKey(press('d', { ctrlKey: true }), { ...ready, hasSelection: false })).toBeNull();
    });

    it('leaves every shortcut but save to a field while typing', () => {
        const typing = { ...ready, typing: true };
        for (const event of [
            press('z', { ctrlKey: true }),
            press('y', { ctrlKey: true }),
            press('d', { ctrlKey: true }),
            press('Delete'),
            press('Backspace'),
            press('Escape'),
            press('ArrowLeft'),
        ]) {
            expect(resolveDesignerKey(event, typing)).toBeNull();
        }
    });

    it('deletes, deselects and nudges only inside the designer with a layer selected', () => {
        const events = [
            [press('Delete'), 'remove'],
            [press('Backspace'), 'remove'],
            [press('Escape'), 'deselect'],
            [press('ArrowLeft'), 'nudgeLeft'],
            [press('ArrowRight'), 'nudgeRight'],
            [press('ArrowUp'), 'nudgeUp'],
            [press('ArrowDown'), 'nudgeDown'],
            [press('ArrowDown', { shiftKey: true }), 'nudgeDown'],
        ] as const;
        for (const [event, command] of events) {
            expect(resolveDesignerKey(event, ready)).toBe(command);
            expect(resolveDesignerKey(event, { ...ready, inArea: false })).toBeNull();
            expect(resolveDesignerKey(event, { ...ready, hasSelection: false })).toBeNull();
        }
    });

    it('ignores keys with extra modifiers', () => {
        expect(resolveDesignerKey(press('Backspace', { ctrlKey: true }), ready)).toBeNull();
        expect(resolveDesignerKey(press('Delete', { shiftKey: true }), ready)).toBeNull();
        expect(resolveDesignerKey(press('ArrowLeft', { altKey: true }), ready)).toBeNull();
        expect(resolveDesignerKey(press('ArrowLeft', { ctrlKey: true }), ready)).toBeNull();
        expect(resolveDesignerKey(press('s', { ctrlKey: true, altKey: true }), ready)).toBeNull();
        expect(resolveDesignerKey(press('z', { ctrlKey: true, altKey: true }), ready)).toBeNull();
        expect(resolveDesignerKey(press('d', { ctrlKey: true, shiftKey: true }), ready)).toBeNull();
    });
});

describe('nudgeDelta', () => {
    it('steps by NUDGE, or NUDGE_BIG with Shift', () => {
        expect(nudgeDelta('nudgeLeft', false)).toEqual({ dx: -NUDGE, dy: 0 });
        expect(nudgeDelta('nudgeRight', true)).toEqual({ dx: NUDGE_BIG, dy: 0 });
        expect(nudgeDelta('nudgeUp', false)).toEqual({ dx: 0, dy: -NUDGE });
        expect(nudgeDelta('nudgeDown', true)).toEqual({ dx: 0, dy: NUDGE_BIG });
        expect(nudgeDelta('save', false)).toBeNull();
    });
});

describe('ariaKeys', () => {
    it('lists Ctrl and Cmd variants for the toolbar buttons', () => {
        expect(ariaKeys('save')).toBe('Control+S Meta+S');
        expect(ariaKeys('undo')).toBe('Control+Z Meta+Z');
        expect(ariaKeys('redo')).toBe('Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y');
    });

    it('every command has one entry', () => {
        const commands = DESIGNER_SHORTCUTS.map((entry) => entry.command);
        expect(new Set(commands).size).toBe(commands.length);
    });
});
