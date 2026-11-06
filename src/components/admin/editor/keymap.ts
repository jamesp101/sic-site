/**
 * The block editor's keyboard shortcuts: one table drives key routing (`resolveKey`), the
 * shortcuts dialog (`SHORTCUTS`) and the buttons' `aria-keyshortcuts` (`ariaKeys`).
 */

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

/** A key chord. `mod` is Ctrl or Cmd. A modifier left `undefined` is ignored; `false` must be up. */
interface Chord {
    key: string;
    mod?: boolean;
    shift?: boolean;
    alt?: boolean;
}

/**
 * - `always`: even while typing (the command decides what to do).
 * - `idle`: not while typing in a field or editing text inline.
 * - `idle-selection`: idle and an element is selected.
 * - `idle-parent` / `idle-child`: idle and the selection has a parent / a first child.
 * - `navigation`: idle, and focus is not in the layers list or on a button, which keep plain
 *   arrow keys and Enter for themselves.
 * - `navigation-selection`: `navigation` and an element is selected.
 */
type When =
    | 'always'
    | 'idle'
    | 'idle-selection'
    | 'navigation'
    | 'navigation-selection'
    | 'navigation-parent'
    | 'navigation-child';

interface Shortcut {
    command: EditorCommand;
    label: string;
    chords: Chord[];
    when: When;
}

export const SHORTCUTS: readonly Shortcut[] = [
    {
        command: 'undo',
        label: 'Undo',
        chords: [{ key: 'z', mod: true, shift: false }],
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
    { command: 'help', label: 'Show these shortcuts', chords: [{ key: '?', mod: false, alt: false }], when: 'idle' },
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
    { command: 'selectPrevious', label: 'Select the previous element', chords: [plain('ArrowUp')], when: 'navigation' },
    { command: 'selectNext', label: 'Select the next element', chords: [plain('ArrowDown')], when: 'navigation' },
    { command: 'selectParent', label: 'Select the parent', chords: [plain('ArrowLeft')], when: 'navigation-parent' },
    {
        command: 'selectChild',
        label: 'Select the first child',
        chords: [plain('ArrowRight')],
        when: 'navigation-child',
    },
    { command: 'edit', label: 'Edit the selected text', chords: [plain('Enter')], when: 'navigation-selection' },
];

function plain(key: string): Chord {
    return { key, mod: false, alt: false, shift: false };
}

export interface KeyEventLike {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

export interface KeyContext {
    /** Focus is in a field, or text is being edited inline. */
    typing: boolean;
    /** Focus is in the layers list or on a button. */
    inList: boolean;
    hasSelection: boolean;
    hasParent: boolean;
    hasChild: boolean;
}

const isLetter = (key: string) => key.length === 1 && key.toLowerCase() !== key.toUpperCase();

function matches(chord: Chord, event: KeyEventLike): boolean {
    const key = isLetter(event.key) ? event.key.toLowerCase() : event.key;
    if (key !== chord.key) return false;
    if (chord.mod !== undefined && chord.mod !== (event.ctrlKey || event.metaKey)) return false;
    if (chord.shift !== undefined && chord.shift !== event.shiftKey) return false;
    if (chord.alt !== undefined && chord.alt !== event.altKey) return false;
    return true;
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
    for (const shortcut of SHORTCUTS) {
        if (shortcut.chords.some((chord) => matches(chord, event))) {
            return applies(shortcut.when, context) ? shortcut.command : null;
        }
    }
    return null;
}

/** The `aria-keyshortcuts` value of a command: every chord, with Ctrl and Cmd variants. */
export function ariaKeys(command: EditorCommand): string {
    const shortcut = SHORTCUTS.find((entry) => entry.command === command);
    if (!shortcut) return '';
    const parts: string[] = [];
    for (const chord of shortcut.chords) {
        const name = isLetter(chord.key) ? chord.key.toUpperCase() : chord.key;
        const rest = [chord.alt ? 'Alt' : '', chord.shift ? 'Shift' : '', name].filter(Boolean);
        if (chord.mod) parts.push(['Control', ...rest].join('+'), ['Meta', ...rest].join('+'));
        else parts.push(rest.join('+'));
    }
    return parts.join(' ');
}

const DISPLAY_NAMES: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Delete: 'Del',
    Escape: 'Esc',
};

/** The shortcut as the dialog shows it, e.g. `Ctrl+Shift+Z or Ctrl+Y`. */
export function displayKeys(shortcut: Shortcut): string {
    return shortcut.chords
        .map((chord) => {
            const name = DISPLAY_NAMES[chord.key] ?? (isLetter(chord.key) ? chord.key.toUpperCase() : chord.key);
            return [chord.mod ? 'Ctrl' : '', chord.alt ? 'Alt' : '', chord.shift ? 'Shift' : '', name]
                .filter(Boolean)
                .join('+');
        })
        .join(' or ');
}
