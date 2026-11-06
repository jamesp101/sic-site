import { describe, expect, it } from 'vite-plus/test';
import { ariaKeys, displayKeys, resolveKey, SHORTCUTS, type KeyContext, type KeyEventLike } from './keymap';

const idle: KeyContext = { typing: false, inList: false, hasSelection: true, hasParent: true, hasChild: true };
const press = (key: string, mods: Partial<Omit<KeyEventLike, 'key'>> = {}): KeyEventLike => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
});

describe('resolveKey', () => {
    it('undo and redo accept Ctrl and Cmd', () => {
        expect(resolveKey(press('z', { ctrlKey: true }), idle)).toBe('undo');
        expect(resolveKey(press('z', { metaKey: true }), idle)).toBe('undo');
        expect(resolveKey(press('z', { ctrlKey: true, shiftKey: true }), idle)).toBe('redo');
        expect(resolveKey(press('Z', { metaKey: true, shiftKey: true }), idle)).toBe('redo');
        expect(resolveKey(press('y', { ctrlKey: true }), idle)).toBe('redo');
    });

    it('leaves undo, redo and every other shortcut to the field while typing', () => {
        const typing = { ...idle, typing: true };
        expect(resolveKey(press('z', { ctrlKey: true }), typing)).toBeNull();
        expect(resolveKey(press('y', { ctrlKey: true }), typing)).toBeNull();
        expect(resolveKey(press('d', { ctrlKey: true }), typing)).toBeNull();
        expect(resolveKey(press('Delete'), typing)).toBeNull();
        expect(resolveKey(press('?'), typing)).toBeNull();
        expect(resolveKey(press('ArrowDown'), typing)).toBeNull();
        expect(resolveKey(press('ArrowUp', { altKey: true }), typing)).toBeNull();
        expect(resolveKey(press('Enter'), typing)).toBeNull();
    });

    it('Escape always resolves, even while typing', () => {
        expect(resolveKey(press('Escape'), idle)).toBe('escape');
        expect(resolveKey(press('Escape'), { ...idle, typing: true })).toBe('escape');
    });

    it('duplicates with Ctrl+D or Cmd+D', () => {
        expect(resolveKey(press('d', { ctrlKey: true }), idle)).toBe('duplicate');
        expect(resolveKey(press('d', { metaKey: true }), idle)).toBe('duplicate');
        expect(resolveKey(press('d'), idle)).toBeNull();
    });

    it('Alt+arrows move the element', () => {
        expect(resolveKey(press('ArrowUp', { altKey: true }), idle)).toBe('moveUp');
        expect(resolveKey(press('ArrowDown', { altKey: true }), idle)).toBe('moveDown');
        expect(resolveKey(press('ArrowLeft', { altKey: true }), idle)).toBe('outdent');
        expect(resolveKey(press('ArrowRight', { altKey: true }), idle)).toBe('indent');
    });

    it('Delete and Backspace remove only when something is selected', () => {
        expect(resolveKey(press('Delete'), idle)).toBe('remove');
        expect(resolveKey(press('Backspace'), idle)).toBe('remove');
        expect(resolveKey(press('Delete'), { ...idle, hasSelection: false })).toBeNull();
    });

    it('? opens help without Ctrl, Cmd or Alt', () => {
        expect(resolveKey(press('?', { shiftKey: true }), idle)).toBe('help');
        expect(resolveKey(press('?', { ctrlKey: true }), idle)).toBeNull();
        expect(resolveKey(press('?', { altKey: true }), idle)).toBeNull();
    });

    it('plain arrows and Enter navigate, with no modifiers', () => {
        expect(resolveKey(press('ArrowUp'), idle)).toBe('selectPrevious');
        expect(resolveKey(press('ArrowDown'), idle)).toBe('selectNext');
        expect(resolveKey(press('ArrowLeft'), idle)).toBe('selectParent');
        expect(resolveKey(press('ArrowRight'), idle)).toBe('selectChild');
        expect(resolveKey(press('Enter'), idle)).toBe('edit');
        expect(resolveKey(press('ArrowDown', { shiftKey: true }), idle)).toBeNull();
        expect(resolveKey(press('ArrowDown', { ctrlKey: true }), idle)).toBeNull();
        expect(resolveKey(press('Enter', { shiftKey: true }), idle)).toBeNull();
    });

    it('navigation needs the right selection', () => {
        expect(resolveKey(press('ArrowLeft'), { ...idle, hasParent: false })).toBeNull();
        expect(resolveKey(press('ArrowRight'), { ...idle, hasChild: false })).toBeNull();
        expect(resolveKey(press('Enter'), { ...idle, hasSelection: false })).toBeNull();
        expect(resolveKey(press('ArrowDown'), { ...idle, hasSelection: false })).toBe('selectNext');
    });

    it('the layers list and buttons keep plain arrows and Enter, but not shortcuts', () => {
        const inList = { ...idle, inList: true };
        expect(resolveKey(press('ArrowDown'), inList)).toBeNull();
        expect(resolveKey(press('Enter'), inList)).toBeNull();
        expect(resolveKey(press('ArrowUp', { altKey: true }), inList)).toBe('moveUp');
        expect(resolveKey(press('Delete'), inList)).toBe('remove');
        expect(resolveKey(press('z', { ctrlKey: true }), inList)).toBe('undo');
    });
});

describe('derived labels', () => {
    const shortcut = (command: string) => SHORTCUTS.find((entry) => entry.command === command)!;

    it('aria-keyshortcuts lists Ctrl and Cmd variants', () => {
        expect(ariaKeys('undo')).toBe('Control+Z Meta+Z');
        expect(ariaKeys('redo')).toBe('Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y');
        expect(ariaKeys('duplicate')).toBe('Control+D Meta+D');
        expect(ariaKeys('remove')).toBe('Delete Backspace');
        expect(ariaKeys('moveUp')).toBe('Alt+ArrowUp');
        expect(ariaKeys('help')).toBe('?');
    });

    it('the dialog shows the documented keys', () => {
        expect(displayKeys(shortcut('undo'))).toBe('Ctrl+Z');
        expect(displayKeys(shortcut('redo'))).toBe('Ctrl+Shift+Z or Ctrl+Y');
        expect(displayKeys(shortcut('remove'))).toBe('Del or Backspace');
        expect(displayKeys(shortcut('moveUp'))).toBe('Alt+↑');
        expect(displayKeys(shortcut('selectChild'))).toBe('→');
        expect(displayKeys(shortcut('escape'))).toBe('Esc');
        expect(displayKeys(shortcut('help'))).toBe('?');
    });
});
