/**
 * Mechanics shared by the admin key tables (block editor, Slide designer): chord matching,
 * first-applicable resolution and the derived `aria-keyshortcuts` / display strings. A table owns
 * its commands, its `when` guards and its context.
 */

/**
 * A key chord. `mod` is Ctrl or Cmd. Every modifier must match exactly: one left out must be up.
 * `shift: 'any'` ignores Shift (for characters like `?` that need it on some layouts).
 */
export interface Chord {
    key: string;
    mod?: boolean;
    shift?: boolean | 'any';
    alt?: boolean;
}

export interface KeyEventLike {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

export interface Shortcut<Command extends string, When extends string> {
    command: Command;
    label: string;
    chords: readonly Chord[];
    when: When;
}

const isLetter = (key: string) => key.length === 1 && key.toLowerCase() !== key.toUpperCase();

export function matchesChord(chord: Chord, event: KeyEventLike): boolean {
    const key = isLetter(event.key) ? event.key.toLowerCase() : event.key;
    if (key !== chord.key) return false;
    if ((chord.mod ?? false) !== (event.ctrlKey || event.metaKey)) return false;
    if (chord.shift !== 'any' && (chord.shift ?? false) !== event.shiftKey) return false;
    return (chord.alt ?? false) === event.altKey;
}

/** The command of the first shortcut whose chord matches and whose `when` applies, else `null`. */
export function resolveShortcut<Command extends string, When extends string, Context>(
    table: readonly Pick<Shortcut<Command, When>, 'command' | 'chords' | 'when'>[],
    event: KeyEventLike,
    context: Context,
    applies: (when: When, context: Context) => boolean,
): Command | null {
    for (const shortcut of table) {
        if (shortcut.chords.some((chord) => matchesChord(chord, event)) && applies(shortcut.when, context)) {
            return shortcut.command;
        }
    }
    return null;
}

/** The `aria-keyshortcuts` value of chords: every chord, with Ctrl and Cmd variants. */
export function ariaKeysOf(chords: readonly Chord[]): string {
    const parts: string[] = [];
    for (const chord of chords) {
        const name = isLetter(chord.key) ? chord.key.toUpperCase() : chord.key;
        const rest = [chord.alt ? 'Alt' : '', chord.shift === true ? 'Shift' : '', name].filter(Boolean);
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

/** Chords as a dialog shows them, e.g. `Ctrl+Shift+Z or Ctrl+Y`. */
export function displayKeysOf(chords: readonly Chord[]): string {
    return chords
        .map((chord) => {
            const name = DISPLAY_NAMES[chord.key] ?? (isLetter(chord.key) ? chord.key.toUpperCase() : chord.key);
            return [chord.mod ? 'Ctrl' : '', chord.alt ? 'Alt' : '', chord.shift === true ? 'Shift' : '', name]
                .filter(Boolean)
                .join('+');
        })
        .join(' or ');
}
