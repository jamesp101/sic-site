/**
 * The Slide designer's keyboard shortcuts: one table drives key routing (`resolveDesignerKey`)
 * and the toolbar buttons' `aria-keyshortcuts` (`ariaKeys`). Chord mechanics are shared with the
 * block editor (`../shared/keymap-core.ts`); the commands are the designer's own.
 */

import { NUDGE, NUDGE_BIG } from '@/lib/carousel-editor';
import { ariaKeysOf, resolveShortcut, type KeyEventLike, type Shortcut } from '../shared/keymap-core';

export type { KeyEventLike };

export type DesignerCommand =
    | 'save'
    | 'undo'
    | 'redo'
    | 'duplicate'
    | 'remove'
    | 'deselect'
    | 'nudgeLeft'
    | 'nudgeRight'
    | 'nudgeUp'
    | 'nudgeDown';

/**
 * - `always`: even while typing (Save).
 * - `idle`: not while typing in a field or editing text inline.
 * - `idle-selection`: idle and a Layer is selected.
 * - `canvas-selection`: idle, focus is on the page body or inside the designer area, and a Layer
 *   is selected.
 */
type When = 'always' | 'idle' | 'idle-selection' | 'canvas-selection';

export interface DesignerKeyContext {
    /** Focus is in a field, or text is being edited inline. */
    typing: boolean;
    /** Focus is on the page body or inside the designer area. */
    inArea: boolean;
    hasSelection: boolean;
}

export const DESIGNER_SHORTCUTS: readonly Shortcut<DesignerCommand, When>[] = [
    { command: 'save', label: 'Save the slide', chords: [{ key: 's', mod: true }], when: 'always' },
    { command: 'undo', label: 'Undo', chords: [{ key: 'z', mod: true }], when: 'idle' },
    {
        command: 'redo',
        label: 'Redo',
        chords: [
            { key: 'z', mod: true, shift: true },
            { key: 'y', mod: true },
        ],
        when: 'idle',
    },
    { command: 'duplicate', label: 'Duplicate the layer', chords: [{ key: 'd', mod: true }], when: 'idle-selection' },
    {
        command: 'remove',
        label: 'Delete the layer',
        chords: [{ key: 'Delete' }, { key: 'Backspace' }],
        when: 'canvas-selection',
    },
    { command: 'deselect', label: 'Deselect the layer', chords: [{ key: 'Escape' }], when: 'canvas-selection' },
    {
        command: 'nudgeLeft',
        label: 'Nudge left',
        chords: [{ key: 'ArrowLeft' }, { key: 'ArrowLeft', shift: true }],
        when: 'canvas-selection',
    },
    {
        command: 'nudgeRight',
        label: 'Nudge right',
        chords: [{ key: 'ArrowRight' }, { key: 'ArrowRight', shift: true }],
        when: 'canvas-selection',
    },
    {
        command: 'nudgeUp',
        label: 'Nudge up',
        chords: [{ key: 'ArrowUp' }, { key: 'ArrowUp', shift: true }],
        when: 'canvas-selection',
    },
    {
        command: 'nudgeDown',
        label: 'Nudge down',
        chords: [{ key: 'ArrowDown' }, { key: 'ArrowDown', shift: true }],
        when: 'canvas-selection',
    },
];

function applies(when: When, context: DesignerKeyContext): boolean {
    if (when === 'always') return true;
    if (context.typing) return false;
    if (when === 'idle') return true;
    if (when === 'idle-selection') return context.hasSelection;
    return context.inArea && context.hasSelection;
}

/** The command a key event triggers in this context, or `null` when it is not ours. */
export function resolveDesignerKey(event: KeyEventLike, context: DesignerKeyContext): DesignerCommand | null {
    return resolveShortcut(DESIGNER_SHORTCUTS, event, context, applies);
}

/** The `aria-keyshortcuts` value of a command: every chord, with Ctrl and Cmd variants. */
export function ariaKeys(command: DesignerCommand): string {
    const shortcut = DESIGNER_SHORTCUTS.find((entry) => entry.command === command);
    return shortcut ? ariaKeysOf(shortcut.chords) : '';
}

const NUDGES: Partial<Record<DesignerCommand, { x: number; y: number }>> = {
    nudgeLeft: { x: -1, y: 0 },
    nudgeRight: { x: 1, y: 0 },
    nudgeUp: { x: 0, y: -1 },
    nudgeDown: { x: 0, y: 1 },
};

/** The move of a nudge command in percent of the slide: `NUDGE`, or `NUDGE_BIG` with Shift. */
export function nudgeDelta(command: DesignerCommand, big: boolean): { dx: number; dy: number } | null {
    const direction = NUDGES[command];
    if (!direction) return null;
    const step = big ? NUDGE_BIG : NUDGE;
    return { dx: direction.x * step, dy: direction.y * step };
}
