/**
 * The block editor's keyboard shortcuts: one table drives key routing (`resolveKey`), the
 * shortcuts dialog (`SHORTCUTS`) and the buttons' `aria-keyshortcuts` (`ariaKeys`). The chord
 * mechanics are shared with the Slide designer (`../shared/keymap-core.ts`).
 */

import {
    ariaKeysOf,
    displayKeysOf,
    resolveShortcut,
    type KeyEventLike,
    type Shortcut as SharedShortcut,
} from '../shared/keymap-core';

export type { KeyEventLike };

export type EditorCommand =
    | 'undo'
    | 'redo'
    | 'duplicate'
    | 'remove'
    | 'moveUp'
    | 'moveDown'
    | 'outdent'
    | 'indent'
    | 'selectPrevious'
    | 'selectNext'
    | 'selectParent'
    | 'selectChild'
    | 'edit'
    | 'escape'
    | 'help';

/**
 * - `always`: even while typing (the command decides what to do).
 * - `idle`: not while typing in a field or editing text inline.
 * - `idle-selection`: idle and an element is selected.
 * - `navigation`: idle, and focus is not in the layers list or on a button, which keep plain
 *   arrow keys and Enter for themselves.
 * - `navigation-selection`: `navigation` and an element is selected.
 * - `navigation-parent` / `navigation-child`: `navigation` and the selection has a parent / a
 *   first child.
 */
type When =
    | 'always'
    | 'idle'
    | 'idle-selection'
    | 'navigation'
    | 'navigation-selection'
    | 'navigation-parent'
    | 'navigation-child';

type Shortcut = SharedShortcut<EditorCommand, When>;

export const SHORTCUTS: readonly Shortcut[] = [
    {
        command: 'undo',
        label: 'Undo',
        chords: [{ key: 'z', mod: true }],
        when: 'idle',
    },
    {
        command: 'redo',
        label: 'Redo',
        chords: [
            { key: 'z', mod: true, shift: true },
            { key: 'y', mod: true },
        ],
        when: 'idle',
    },
    { command: 'escape', label: 'Deselect, or leave full screen', chords: [{ key: 'Escape' }], when: 'always' },
    { command: 'help', label: 'Show these shortcuts', chords: [{ key: '?', shift: 'any' }], when: 'idle' },
    { command: 'duplicate', label: 'Duplicate the selected element', chords: [{ key: 'd', mod: true }], when: 'idle' },
    { command: 'moveUp', label: 'Move up', chords: [{ key: 'ArrowUp', alt: true }], when: 'idle' },
    { command: 'moveDown', label: 'Move down', chords: [{ key: 'ArrowDown', alt: true }], when: 'idle' },
    { command: 'outdent', label: 'Move out of the container', chords: [{ key: 'ArrowLeft', alt: true }], when: 'idle' },
    {
        command: 'indent',
        label: 'Move into the previous container',
        chords: [{ key: 'ArrowRight', alt: true }],
        when: 'idle',
    },
    {
        command: 'remove',
        label: 'Delete the selected element',
        chords: [{ key: 'Delete' }, { key: 'Backspace' }],
        when: 'idle-selection',
    },
    {
        command: 'selectPrevious',
        label: 'Select the previous element',
        chords: [{ key: 'ArrowUp' }],
        when: 'navigation',
    },
    { command: 'selectNext', label: 'Select the next element', chords: [{ key: 'ArrowDown' }], when: 'navigation' },
    { command: 'selectParent', label: 'Select the parent', chords: [{ key: 'ArrowLeft' }], when: 'navigation-parent' },
    {
        command: 'selectChild',
        label: 'Select the first child',
        chords: [{ key: 'ArrowRight' }],
        when: 'navigation-child',
    },
    { command: 'edit', label: 'Edit the selected text', chords: [{ key: 'Enter' }], when: 'navigation-selection' },
];

export interface KeyContext {
    /** Focus is in a field, or text is being edited inline. */
    typing: boolean;
    /** Focus is in the layers list or on a button. */
    inList: boolean;
    hasSelection: boolean;
    hasParent: boolean;
    hasChild: boolean;
}

function applies(when: When, context: KeyContext): boolean {
    if (when === 'always') return true;
    if (context.typing) return false;
    if (when === 'idle') return true;
    if (when === 'idle-selection') return context.hasSelection;
    if (context.inList) return false;
    if (when === 'navigation') return true;
    if (when === 'navigation-selection') return context.hasSelection;
    if (when === 'navigation-parent') return context.hasParent;
    return context.hasChild;
}

/** The command a key event triggers in this context, or `null` when it is not ours. */
export function resolveKey(event: KeyEventLike, context: KeyContext): EditorCommand | null {
    return resolveShortcut(SHORTCUTS, event, context, applies);
}

/** The `aria-keyshortcuts` value of a command: every chord, with Ctrl and Cmd variants. */
export function ariaKeys(command: EditorCommand): string {
    const shortcut = SHORTCUTS.find((entry) => entry.command === command);
    return shortcut ? ariaKeysOf(shortcut.chords) : '';
}

/** The shortcut as the dialog shows it, e.g. `Ctrl+Shift+Z or Ctrl+Y`. */
export function displayKeys(shortcut: Shortcut): string {
    return displayKeysOf(shortcut.chords);
}
