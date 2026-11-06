import { describe, expect, it } from 'vite-plus/test';
import { ariaKeysOf, displayKeysOf, matchesChord, resolveShortcut, type KeyEventLike } from './keymap-core';

const press = (key: string, mods: Partial<Omit<KeyEventLike, 'key'>> = {}): KeyEventLike => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
});

describe('matchesChord', () => {
    it('matches modifiers exactly; an unlisted modifier must be up', () => {
        expect(matchesChord({ key: 'Delete' }, press('Delete'))).toBe(true);
        expect(matchesChord({ key: 'Delete' }, press('Delete', { shiftKey: true }))).toBe(false);
        expect(matchesChord({ key: 'Backspace' }, press('Backspace', { ctrlKey: true }))).toBe(false);
        expect(matchesChord({ key: 'Backspace' }, press('Backspace', { metaKey: true }))).toBe(false);
        expect(matchesChord({ key: 'Backspace' }, press('Backspace', { altKey: true }))).toBe(false);
    });

    it('treats Ctrl and Cmd alike for `mod`, and letters case-insensitively', () => {
        const chord = { key: 'd', mod: true };
        expect(matchesChord(chord, press('d', { ctrlKey: true }))).toBe(true);
        expect(matchesChord(chord, press('D', { metaKey: true }))).toBe(true);
        expect(matchesChord(chord, press('d'))).toBe(false);
        expect(matchesChord(chord, press('d', { ctrlKey: true, shiftKey: true }))).toBe(false);
        expect(matchesChord(chord, press('d', { ctrlKey: true, altKey: true }))).toBe(false);
    });

    it("`shift: 'any'` ignores Shift only", () => {
        const chord = { key: '?', shift: 'any' } as const;
        expect(matchesChord(chord, press('?'))).toBe(true);
        expect(matchesChord(chord, press('?', { shiftKey: true }))).toBe(true);
        expect(matchesChord(chord, press('?', { ctrlKey: true }))).toBe(false);
    });
});

describe('resolveShortcut', () => {
    type Ctx = { a: boolean; b: boolean };
    const table = [
        { command: 'first', chords: [{ key: 'x' }], when: 'a' },
        { command: 'second', chords: [{ key: 'x' }], when: 'b' },
    ] as const;
    const applies = (when: 'a' | 'b', context: Ctx) => context[when];

    it('continues to the next shortcut when the first match does not apply', () => {
        expect(resolveShortcut(table, press('x'), { a: false, b: true }, applies)).toBe('second');
        expect(resolveShortcut(table, press('x'), { a: true, b: true }, applies)).toBe('first');
        expect(resolveShortcut(table, press('x'), { a: false, b: false }, applies)).toBeNull();
    });
});

describe('labels', () => {
    it('lists Ctrl and Cmd variants for aria and one Ctrl form for display', () => {
        const chords = [
            { key: 'z', mod: true, shift: true },
            { key: 'y', mod: true },
        ];
        expect(ariaKeysOf(chords)).toBe('Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y');
        expect(displayKeysOf(chords)).toBe('Ctrl+Shift+Z or Ctrl+Y');
    });
});
