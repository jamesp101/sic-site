/**
 * Pure interaction logic of the org chart editor: viewport maths, key → intent mapping, the drop zone and the
 * select / create / rename transitions. The component owns the DOM, focus and `matchMedia`, and applies the results.
 */

import type { DropPosition, KeyboardMove, OrgLinked, OrgMember } from './org-tree';
import { nextOrder, siblingsOf } from './org-tree';

// ---------------------------------------------------------------- viewport

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;

/** The canvas transform: content is drawn at `translate(tx, ty) scale(scale)`. */
export interface Viewport {
    scale: number;
    tx: number;
    ty: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/** The transform that centres `content` in `viewport`, shrinking (never enlarging) it to fit; null while either is unlaid-out. */
export function fitViewport(viewport: Size, content: Size): Viewport | null {
    if (content.width === 0 || content.height === 0) return null;
    const scale = clampScale(
        Math.min(1, (viewport.width - 48) / content.width, (viewport.height - 96) / content.height),
    );
    return {
        scale,
        tx: (viewport.width - content.width * scale) / 2,
        ty: Math.max(56, (viewport.height - content.height * scale) / 2),
    };
}

/** Scales by `factor` (clamped) keeping the point (`px`, `py`), relative to the viewport, fixed on screen. */
export function zoomAt(view: Viewport, factor: number, px: number, py: number): Viewport {
    const scale = clampScale(view.scale * factor);
    const k = scale / view.scale;
    return { scale, tx: px - (px - view.tx) * k, ty: py - (py - view.ty) * k };
}

export function panBy(view: Viewport, dx: number, dy: number): Viewport {
    return { ...view, tx: view.tx + dx, ty: view.ty + dy };
}

export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };

/** Ctrl/Cmd + wheel zooms; a plain wheel pans. */
export function wheelIntent(wheel: { deltaX: number; deltaY: number; zoomModifier: boolean }): WheelIntent {
    if (wheel.zoomModifier) return { kind: 'zoom', factor: Math.exp(-wheel.deltaY * 0.0015) };
    return { kind: 'pan', dx: -wheel.deltaX, dy: -wheel.deltaY };
}

/** Pointer travel (px, Manhattan) before a press on the canvas counts as a pan instead of a click. */
const PAN_THRESHOLD = 3;

export const isPanGesture = (dx: number, dy: number) => Math.abs(dx) + Math.abs(dy) > PAN_THRESHOLD;

/** How far to pan so `card` is inside `viewport` (or centred when `center`); null when it is already visible. */
export function revealShift(viewport: Rect, card: Rect, center = false): { dx: number; dy: number } | null {
    const inside =
        card.left >= viewport.left + 16 &&
        card.right <= viewport.right - 16 &&
        card.top >= viewport.top + 56 &&
        card.bottom <= viewport.bottom - 16;
    if (inside && !center) return null;
    return {
        dx: (viewport.left + viewport.right) / 2 - (card.left + card.right) / 2,
        dy: (viewport.top + viewport.bottom) / 2 - (card.top + card.bottom) / 2,
    };
}

// -------------------------------------------------------------- drop zone

/**
 * Where on a card a drag is hovering: the outer quarters place before/after (along the layout axis: horizontal on
 * desktop, vertical on mobile), the middle makes the dragged member a child.
 */
export function dropZone(pointer: { x: number; y: number }, card: Rect, horizontal: boolean): DropPosition {
    const ratio = horizontal
        ? (pointer.x - card.left) / (card.right - card.left)
        : (pointer.y - card.top) / (card.bottom - card.top);
    return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'child';
}

// ------------------------------------------------------------------- keys

export interface KeyInput {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}

export const ALT_MOVES: Record<string, { move: KeyboardMove; label: string }> = {
    ArrowUp: { move: 'up', label: 'earlier among its siblings' },
    ArrowDown: { move: 'down', label: 'later among its siblings' },
    ArrowLeft: { move: 'out', label: 'up a level' },
    ArrowRight: { move: 'in', label: 'under the previous sibling' },
};

export type ItemKeyIntent =
    | { kind: 'move'; move: KeyboardMove; label: string }
    | { kind: 'open' }
    | { kind: 'rename' }
    | { kind: 'delete' }
    | { kind: 'focus'; id: number };

/**
 * What a key does on a focused card; null leaves the key to the browser. Arrow navigation follows the tree in
 * reading order (`flat`), Right goes to the first direct report and Left to the manager.
 */
export function itemKeyIntent(key: KeyInput, id: number, members: OrgLinked[], flat: number[]): ItemKeyIntent | null {
    const member = members.find((m) => m.id === id);
    if (!member) return null;
    if (key.altKey && !key.ctrlKey && !key.metaKey) {
        const alt = ALT_MOVES[key.key];
        return alt ? { kind: 'move', move: alt.move, label: alt.label } : null;
    }
    if (key.altKey || key.ctrlKey || key.metaKey) return null;
    const focus = (target: number | undefined): ItemKeyIntent | null =>
        target === undefined ? null : { kind: 'focus', id: target };
    const index = flat.indexOf(id);
    switch (key.key) {
        case 'Enter':
        case ' ':
            return { kind: 'open' };
        case 'F2':
            return { kind: 'rename' };
        case 'Delete':
            return { kind: 'delete' };
        case 'ArrowDown':
            return focus(flat[index + 1]);
        case 'ArrowUp':
            return focus(flat[index - 1]);
        case 'ArrowRight':
            return focus(siblingsOf(members, id)[0]?.id);
        case 'ArrowLeft':
            return focus(member.parentId ?? undefined);
        case 'Home':
            return focus(flat[0]);
        case 'End':
            return focus(flat.at(-1));
        default:
            return null;
    }
}

/** Enter in the search box jumps to the next match after `focusId`, wrapping; null when nothing matches. */
export function nextSearchMatch(flat: number[], matches: ReadonlySet<number>, focusId: number | null): number | null {
    const ids = flat.filter((id) => matches.has(id));
    if (ids.length === 0) return null;
    return ids[(ids.indexOf(focusId ?? -1) + 1) % ids.length];
}

// ------------------------------------------------------ selection state

export interface CreateContext {
    parentId: number | null;
    afterId: number | null;
    order: number;
    nonce: number;
}

export interface ChartUi {
    selectedId: number | null;
    creating: CreateContext | null;
    renamingId: number | null;
    renameValue: string;
    /** Last issued `creating.nonce`; keeps each create session's inspector distinct. */
    nonce: number;
}

export const initialUi: ChartUi = { selectedId: null, creating: null, renamingId: null, renameValue: '', nonce: 0 };

export function selectMember(ui: ChartUi, id: number | null): ChartUi {
    return { ...ui, creating: null, selectedId: id };
}

export function startCreate(
    ui: ChartUi,
    members: OrgLinked[],
    parentId: number | null,
    afterId: number | null,
): ChartUi {
    const nonce = ui.nonce + 1;
    return { ...ui, nonce, creating: { parentId, afterId, order: nextOrder(members, parentId), nonce } };
}

export function closeInspector(ui: ChartUi): ChartUi {
    return { ...ui, creating: null, selectedId: null };
}

/** A click on empty canvas deselects, unless it ended a pan or a new member is being drafted. */
export function canvasClick(ui: ChartUi, panned: boolean): ChartUi {
    return !panned && !ui.creating ? { ...ui, selectedId: null } : ui;
}

export function startRename(ui: ChartUi, members: OrgMember[], id: number): ChartUi {
    const member = members.find((m) => m.id === id);
    return member ? { ...ui, renamingId: id, renameValue: member.name } : ui;
}

export function setRenameValue(ui: ChartUi, renameValue: string): ChartUi {
    return { ...ui, renameValue };
}

export function cancelRename(ui: ChartUi): ChartUi {
    return { ...ui, renamingId: null };
}

/**
 * Ends renaming `id`. `name` is the trimmed new name to save, or null when nothing changed (empty, unchanged or the
 * member is gone). Returns null when `id` is not being renamed (e.g. blur after Escape).
 */
export function commitRename(
    ui: ChartUi,
    members: OrgMember[],
    id: number,
): { ui: ChartUi; name: string | null } | null {
    if (ui.renamingId !== id) return null;
    const name = ui.renameValue.trim();
    const member = members.find((m) => m.id === id);
    return { ui: cancelRename(ui), name: member && name && name !== member.name ? name : null };
}

/** The new member is saved: leave the draft and select it. */
export function createdMember(ui: ChartUi, id: number): ChartUi {
    return { ...ui, creating: null, selectedId: id };
}

/** "Add peer" slots the new member right after the card it was added beside, if the form kept the proposed place. */
export function peerAnchor(
    context: CreateContext | null,
    saved: { parentId: number | null; order: number },
): number | null {
    if (context?.afterId == null) return null;
    return saved.parentId === context.parentId && saved.order === context.order ? context.afterId : null;
}

/** After deleting `target`, a selection on it moves up to its manager (if still present). */
export function afterDelete(
    ui: ChartUi,
    members: OrgLinked[],
    target: { id: number; parentId: number | null },
): ChartUi {
    if (ui.selectedId !== target.id) return ui;
    const manager = target.parentId;
    return { ...ui, selectedId: manager !== null && members.some((m) => m.id === manager) ? manager : null };
}
