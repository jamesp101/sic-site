/**
 * Imperative controller for the editor canvas: an iframe that renders the block document with the
 * site's real stylesheet (so Tailwind breakpoints, dark mode and tokens behave exactly as on the public
 * page). It owns selection/hover outlines, the drag handle, drop indicators, inline text editing and
 * pointer drag & drop. All document changes go back to the host through callbacks.
 */
import { CONTAINER_TYPES, type BlockType } from '@/lib/blocks/types';
import { domToInline, domToPlain } from './inline-dom';

export type CanvasSource =
    | { kind: 'new'; type: BlockType; label: string }
    | { kind: 'move'; id: string; label: string };

/** Insert before `beforeId` inside `parentId` (`null` parent = document root, `null` before = at the end). */
export interface DropTarget {
    parentId: string | null;
    beforeId: string | null;
}

export interface CanvasHost {
    select(id: string | null): void;
    /** Inline edit finished with a changed value. */
    commitText(id: string, patch: Record<string, string>): void;
    key(event: KeyboardEvent, editing: boolean): void;
    drop(source: CanvasSource, target: DropTarget): void;
    canDrop(source: CanvasSource, parentId: string | null): boolean;
    /** Whether a drag is in progress (to suppress hover chrome in the host). */
    dragging(active: boolean): void;
}

const EDITOR_CSS = `
html{scroll-behavior:auto}
body{min-height:100vh;margin:0}
[data-block-id]{position:relative}
[data-block-id][data-hover]:not([data-selected]){outline:1px dashed var(--ring);outline-offset:2px}
[data-block-id][data-selected]{outline:2px solid var(--ring);outline-offset:2px}
[data-block-id][data-drop-target]{outline:2px dashed var(--gold-500);outline-offset:2px;background-image:linear-gradient(color-mix(in srgb,var(--gold-500) 8%,transparent),color-mix(in srgb,var(--gold-500) 8%,transparent))}
[data-block-id][data-dragging]{opacity:.35}
[data-empty]{min-height:4.5rem;border:1px dashed var(--border-strong);border-radius:.75rem;align-items:center;justify-content:center}
[data-empty]::after{content:'Drop elements here';color:var(--muted-foreground);font-size:12px;margin:auto;padding:1rem}
[contenteditable]{outline:2px solid var(--gold-500)!important;outline-offset:2px;cursor:text;min-width:1ch}
.sic-chip{position:absolute;z-index:40;display:flex;align-items:center;gap:4px;height:22px;padding:0 8px 0 4px;border-radius:6px 6px 6px 0;background:var(--ring);color:var(--primary-foreground);font:600 11px/22px var(--font-sans,system-ui),system-ui,sans-serif;cursor:grab;user-select:none;white-space:nowrap}
.sic-chip:active{cursor:grabbing}
.sic-indicator{position:absolute;z-index:45;pointer-events:none;background:var(--gold-500);border-radius:2px;box-shadow:0 0 0 1px var(--surface)}
details>summary{cursor:pointer}
`;

const CONTAINERS: Record<string, true> = Object.fromEntries(CONTAINER_TYPES.map((type) => [type, true]));
/** Block types whose text can be edited directly on the canvas. */
const INLINE_EDITABLE: Record<string, 'plain' | 'rich'> = { heading: 'plain', paragraph: 'rich', button: 'plain' };
const EDGE = 10;
const DRAG_THRESHOLD = 5;

/** Builds the iframe document: the page's own styles plus the editor chrome. */
export function buildSrcdoc(options: { width: 'narrow' | 'wide'; dark: boolean }): string {
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((node) => node.outerHTML)
        .join('\n');
    const container = options.width === 'narrow' ? 'max-w-3xl' : 'max-w-4xl';
    return `<!doctype html><html lang="en" class="${options.dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<style>${EDITOR_CSS}</style></head><body class="bg-background font-sans text-foreground antialiased"><div id="sic-root" class="mx-auto w-full ${container} px-6 py-8 text-base leading-relaxed text-foreground"></div></body></html>`;
}

function blockOf(element: Element | null): HTMLElement | null {
    return element?.closest<HTMLElement>('[data-block-id]') ?? null;
}

/** Block elements nested directly inside `scope` (a block, or the root when `null`). */
function childBlocks(root: HTMLElement, scope: HTMLElement | null): HTMLElement[] {
    const base = scope ?? root;
    return Array.from(base.querySelectorAll<HTMLElement>('[data-block-id]')).filter((el) => {
        const parent = blockOf(el.parentElement);
        return scope ? parent === scope : parent === null;
    });
}

function distanceTo(rect: DOMRect, x: number, y: number): number {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.hypot(dx, dy);
}

export class CanvasController {
    #iframe: HTMLIFrameElement;
    #host: CanvasHost;
    #doc: Document | null = null;
    #root: HTMLElement | null = null;
    #chip: HTMLElement | null = null;
    #indicator: HTMLElement | null = null;
    #selected: string | null = null;
    #hover: HTMLElement | null = null;
    #html = '';
    #editing: { id: string; el: HTMLElement; kind: 'plain' | 'rich'; field: string; before: string } | null = null;
    #drag: {
        source: CanvasSource;
        ghost: HTMLElement;
        target: DropTarget | null;
        started: boolean;
        startX: number;
        startY: number;
    } | null = null;
    #resize: ResizeObserver | null = null;
    #cleanup: (() => void)[] = [];

    constructor(iframe: HTMLIFrameElement, host: CanvasHost) {
        this.#iframe = iframe;
        this.#host = host;
    }

    get editing(): boolean {
        return this.#editing !== null;
    }

    /** Call from the iframe's `load` event. */
    attach(): void {
        const doc = this.#iframe.contentDocument;
        const win = this.#iframe.contentWindow;
        if (!doc || !win) return;
        this.detachListeners();
        this.#doc = doc;
        this.#root = doc.getElementById('sic-root');

        const on = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void) => {
            doc.addEventListener(type, handler as EventListener);
            this.#cleanup.push(() => doc.removeEventListener(type, handler as EventListener));
        };
        on('click', (event) => this.#onClick(event));
        on('dblclick', (event) => this.#onDoubleClick(event));
        on('mouseover', (event) => this.#onHover(event));
        on('mouseleave', () => this.setHover(null));
        on('keydown', (event) => this.#onKeyDown(event));
        on('submit', (event) => event.preventDefault());
        // Browsers navigate on dropped files; the canvas never accepts them.
        on('dragover', (event) => event.preventDefault());
        on('drop', (event) => event.preventDefault());

        this.#resize = new ResizeObserver(() => this.#positionChip());
        if (this.#root) this.#resize.observe(this.#root);
        if (this.#html) this.render(this.#html);
    }

    detachListeners(): void {
        for (const fn of this.#cleanup) fn();
        this.#cleanup = [];
        this.#resize?.disconnect();
    }

    destroy(): void {
        this.detachListeners();
        this.#endDrag(false);
    }

    setDark(dark: boolean): void {
        this.#doc?.documentElement.classList.toggle('dark', dark);
    }

    render(html: string): void {
        this.#html = html;
        if (!this.#root || this.#editing || this.#drag?.started) return;
        const scroller = this.#doc?.scrollingElement;
        const top = scroller?.scrollTop ?? 0;
        this.#root.innerHTML = html;
        if (scroller) scroller.scrollTop = top;
        this.#applySelection();
    }

    setSelected(id: string | null): void {
        this.#selected = id;
        this.#applySelection();
    }

    setHover(id: string | HTMLElement | null): void {
        const next = typeof id === 'string' ? (this.#find(id) ?? null) : id;
        if (next === this.#hover) return;
        this.#hover?.removeAttribute('data-hover');
        this.#hover = next;
        next?.setAttribute('data-hover', '');
    }

    scrollToBlock(id: string): void {
        const win = this.#iframe.contentWindow;
        const rect = this.#find(id)?.getBoundingClientRect();
        if (!win || !rect) return;
        // Scroll inside the canvas only (scrollIntoView would also scroll the admin page).
        if (rect.top < 24) win.scrollBy(0, rect.top - 24);
        else if (rect.bottom > win.innerHeight - 24)
            win.scrollBy(0, Math.min(rect.bottom - win.innerHeight + 24, rect.top - 24));
    }

    /** Puts the block's text into inline-edit mode (heading, text and button blocks). */
    startEdit(id: string): boolean {
        const el = this.#find(id);
        if (!el || this.#editing) return false;
        const type = el.dataset.blockType ?? '';
        const kind = INLINE_EDITABLE[type];
        if (!kind) return false;
        const target = type === 'button' ? el.querySelector<HTMLElement>('a') : el;
        if (!target) return false;

        const field = type === 'button' ? 'label' : 'text';
        const before = kind === 'rich' ? domToInline(target) : domToPlain(target);
        this.#editing = { id, el: target, kind, field, before };
        target.setAttribute('contenteditable', kind === 'plain' ? 'plaintext-only' : 'true');
        target.spellcheck = true;
        target.focus({ preventScroll: true });
        const range = this.#doc!.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const selection = this.#iframe.contentWindow?.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        const finish = () => this.#finishEdit(true);
        target.addEventListener('blur', finish, { once: true });
        target.addEventListener('paste', this.#onPaste);
        return true;
    }

    stopEdit(): void {
        this.#finishEdit(true);
    }

    #onPaste = (event: ClipboardEvent) => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') ?? '';
        this.#doc?.execCommand(
            'insertText',
            false,
            this.#editing?.kind === 'plain' ? text.replace(/\s*\n\s*/g, ' ') : text,
        );
    };

    #finishEdit(commit: boolean): void {
        const editing = this.#editing;
        if (!editing) return;
        this.#editing = null;
        editing.el.removeEventListener('paste', this.#onPaste);
        editing.el.removeAttribute('contenteditable');
        const value = editing.kind === 'rich' ? domToInline(editing.el) : domToPlain(editing.el);
        if (commit && value !== editing.before) {
            // The host re-renders with the new model right after this.
            this.#host.commitText(editing.id, { [editing.field]: value });
            return;
        }
        // Nothing changed: restore the rendered markup so the DOM matches the model again.
        this.render(this.#html);
    }

    #onKeyDown(event: KeyboardEvent): void {
        const editing = this.#editing;
        if (editing) {
            const mod = event.ctrlKey || event.metaKey;
            if (event.key === 'Escape') {
                event.preventDefault();
                this.#finishEdit(false);
            } else if (event.key === 'Enter' && (editing.kind === 'plain' || mod)) {
                event.preventDefault();
                this.#finishEdit(true);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                this.#doc?.execCommand('insertLineBreak');
            } else if (mod && event.key.toLowerCase() === 'k' && editing.kind === 'rich') {
                event.preventDefault();
                const url = this.#iframe.contentWindow?.prompt('Link address (https://…)', 'https://');
                if (url) this.#doc?.execCommand('createLink', false, url);
            } else if (mod && editing.kind === 'plain' && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
                event.preventDefault();
            }
            this.#host.key(event, true);
            return;
        }
        this.#host.key(event, false);
    }

    #onClick(event: MouseEvent): void {
        if (this.#drag?.started) return;
        const target = event.target as Element | null;
        const inEditing = this.#editing?.el.contains(target);
        if (inEditing) return;
        const insideSummary = target?.closest('summary');
        if (!insideSummary) event.preventDefault();
        if (target?.closest('.sic-chip')) return;
        this.#host.select(blockOf(target)?.dataset.blockId ?? null);
    }

    #onDoubleClick(event: MouseEvent): void {
        const block = blockOf(event.target as Element | null);
        if (!block?.dataset.blockId) return;
        this.#host.select(block.dataset.blockId);
        // Wait one tick so the selection render finishes before the element becomes editable.
        setTimeout(() => this.startEdit(block.dataset.blockId!), 0);
    }

    #onHover(event: MouseEvent): void {
        if (this.#drag?.started) return;
        this.setHover(blockOf(event.target as Element | null));
    }

    #find(id: string): HTMLElement | null {
        return this.#root?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`) ?? null;
    }

    #applySelection(): void {
        if (!this.#doc || !this.#root) return;
        this.#hover = null;
        for (const el of this.#root.querySelectorAll('[data-selected]')) el.removeAttribute('data-selected');
        const selected = this.#selected ? this.#find(this.#selected) : null;
        selected?.setAttribute('data-selected', '');
        this.#positionChip();
    }

    #positionChip(): void {
        const doc = this.#doc;
        const win = this.#iframe.contentWindow;
        if (!doc || !win) return;
        const selected = this.#selected ? this.#find(this.#selected) : null;
        if (!selected || this.#editing) {
            this.#chip?.remove();
            this.#chip = null;
            return;
        }
        if (!this.#chip) {
            const chip = doc.createElement('div');
            chip.className = 'sic-chip';
            chip.setAttribute('data-chip', '');
            chip.setAttribute('title', 'Drag to move');
            chip.addEventListener('pointerdown', (event) => this.#onChipPointerDown(event));
            doc.body.appendChild(chip);
            this.#chip = chip;
        }
        const label = selected.dataset.blockLabel ?? 'Block';
        this.#chip.innerHTML = '';
        const grip = doc.createElement('span');
        grip.setAttribute('aria-hidden', 'true');
        grip.textContent = '⠿';
        const text = doc.createElement('span');
        text.textContent = label;
        this.#chip.append(grip, text);
        const rect = selected.getBoundingClientRect();
        const top = rect.top + win.scrollY;
        this.#chip.style.left = `${Math.max(0, rect.left + win.scrollX - 2)}px`;
        this.#chip.style.top = `${top < 26 ? top + 2 : top - 24}px`;
    }

    // -----------------------------------------------------------------------------------------
    // Drag & drop (palette → canvas and canvas move)
    // -----------------------------------------------------------------------------------------

    #onChipPointerDown(event: PointerEvent): void {
        if (event.button !== 0 || !this.#selected) return;
        event.preventDefault();
        const rect = this.#iframe.getBoundingClientRect();
        const scale = rect.width / this.#iframe.offsetWidth || 1;
        this.beginDrag(
            { kind: 'move', id: this.#selected, label: this.#find(this.#selected)?.dataset.blockLabel ?? 'Block' },
            rect.left + event.clientX * scale,
            rect.top + event.clientY * scale,
        );
    }

    /** Starts a drag session. Coordinates are parent-window client coordinates. */
    beginDrag(source: CanvasSource, startX: number, startY: number): void {
        this.#endDrag(false);
        const ghost = document.createElement('div');
        ghost.textContent = source.label;
        ghost.className =
            'pointer-events-none fixed z-[9999] hidden rounded-md bg-brand-800 px-2.5 py-1 text-xs font-semibold text-white shadow-brand-md dark:bg-gold-500 dark:text-brand-950';
        document.body.appendChild(ghost);
        this.#drag = { source, ghost, target: null, started: false, startX, startY };

        const move = (event: PointerEvent) => this.#dragMove(event);
        const up = (event: PointerEvent) => {
            this.#dragMove(event);
            this.#endDrag(true);
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') this.#endDrag(false);
        };
        const win = this.#iframe.contentWindow;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('keydown', key);
        win?.addEventListener('pointermove', move);
        win?.addEventListener('pointerup', up);
        win?.addEventListener('keydown', key);
        this.#dragCleanup = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('keydown', key);
            win?.removeEventListener('pointermove', move);
            win?.removeEventListener('pointerup', up);
            win?.removeEventListener('keydown', key);
        };
    }

    #dragCleanup: (() => void) | null = null;

    #dragMove(event: PointerEvent): void {
        const drag = this.#drag;
        if (!drag) return;
        const rect = this.#iframe.getBoundingClientRect();
        const scale = rect.width / this.#iframe.offsetWidth || 1;
        // Events from inside the iframe carry iframe-space coordinates; convert to parent space.
        const fromFrame = event.view === this.#iframe.contentWindow;
        const x = fromFrame ? rect.left + event.clientX * scale : event.clientX;
        const y = fromFrame ? rect.top + event.clientY * scale : event.clientY;

        if (!drag.started) {
            if (Math.hypot(x - drag.startX, y - drag.startY) < DRAG_THRESHOLD) return;
            drag.started = true;
            drag.ghost.classList.remove('hidden');
            this.#iframe.style.pointerEvents = 'none';
            document.body.style.cursor = 'grabbing';
            this.setHover(null);
            this.#host.dragging(true);
            if (drag.source.kind === 'move') this.#find(drag.source.id)?.setAttribute('data-dragging', '');
        }
        drag.ghost.style.left = `${x + 12}px`;
        drag.ghost.style.top = `${y + 12}px`;

        const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (!inside) {
            this.#setTarget(null);
            return;
        }
        const fx = (x - rect.left) / scale;
        const fy = (y - rect.top) / scale;
        this.#autoScroll(fy);
        this.#setTarget(this.#hitTest(fx, fy, drag.source));
    }

    #autoScroll(frameY: number): void {
        const win = this.#iframe.contentWindow;
        if (!win) return;
        const height = this.#iframe.offsetHeight;
        if (frameY < 48) win.scrollBy(0, -16);
        else if (frameY > height - 48) win.scrollBy(0, 16);
    }

    #setTarget(
        target: {
            drop: DropTarget;
            line: { left: number; top: number; width: number; height: number } | null;
            container: HTMLElement | null;
        } | null,
    ): void {
        const drag = this.#drag;
        if (!drag || !this.#doc) return;
        this.#doc.querySelectorAll('[data-drop-target]').forEach((el) => el.removeAttribute('data-drop-target'));
        if (!target) {
            drag.target = null;
            this.#indicator?.remove();
            this.#indicator = null;
            return;
        }
        drag.target = target.drop;
        target.container?.setAttribute('data-drop-target', '');
        if (!target.line) {
            this.#indicator?.remove();
            this.#indicator = null;
            return;
        }
        if (!this.#indicator) {
            this.#indicator = this.#doc.createElement('div');
            this.#indicator.className = 'sic-indicator';
            this.#doc.body.appendChild(this.#indicator);
        }
        const { left, top, width, height } = target.line;
        Object.assign(this.#indicator.style, {
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
        });
    }

    #endDrag(drop: boolean): void {
        const drag = this.#drag;
        if (!drag) return;
        this.#drag = null;
        this.#dragCleanup?.();
        this.#dragCleanup = null;
        drag.ghost.remove();
        this.#iframe.style.pointerEvents = '';
        document.body.style.cursor = '';
        this.#indicator?.remove();
        this.#indicator = null;
        this.#doc?.querySelectorAll('[data-drop-target],[data-dragging]').forEach((el) => {
            el.removeAttribute('data-drop-target');
            el.removeAttribute('data-dragging');
        });
        if (drag.started) this.#host.dragging(false);
        if (drop && drag.started && drag.target) this.#host.drop(drag.source, drag.target);
        else this.render(this.#html);
    }

    /**
     * Finds where a drop at frame coordinates (x, y) lands. Walks up from the deepest block under the pointer:
     * a container accepts the drop unless the pointer is near its border (then the drop goes beside it).
     */
    #hitTest(x: number, y: number, source: CanvasSource) {
        const doc = this.#doc;
        const win = this.#iframe.contentWindow;
        const root = this.#root;
        if (!doc || !win || !root) return null;
        const movingId = source.kind === 'move' ? source.id : null;
        const moving = movingId ? this.#find(movingId) : null;

        const candidates: (HTMLElement | null)[] = [];
        for (let el = blockOf(doc.elementFromPoint(x, y)); el; el = blockOf(el.parentElement)) {
            if (moving && (el === moving || moving.contains(el))) continue;
            candidates.push(el);
        }
        candidates.push(null);

        for (const candidate of candidates) {
            const parentId = candidate?.dataset.blockId ?? null;
            if (candidate && !CONTAINERS[candidate.dataset.blockType ?? '']) continue;
            if (!this.#host.canDrop(source, parentId)) continue;
            if (candidate) {
                // Near a container's border the drop goes beside it (into its parent) instead of inside.
                const rect = candidate.getBoundingClientRect();
                const nearEdge =
                    x - rect.left < EDGE || rect.right - x < EDGE || y - rect.top < EDGE || rect.bottom - y < EDGE;
                if (nearEdge) continue;
            }
            const kids = childBlocks(root, candidate).filter((el) => el !== moving);
            const container = candidate;
            if (kids.length === 0) {
                return { drop: { parentId, beforeId: null }, line: null, container };
            }
            let nearest = kids[0];
            let best = Infinity;
            for (const kid of kids) {
                const d = distanceTo(kid.getBoundingClientRect(), x, y);
                if (d < best) {
                    best = d;
                    nearest = kid;
                }
            }
            const rect = nearest.getBoundingClientRect();
            const style = container ? win.getComputedStyle(container) : null;
            const horizontal =
                style !== null &&
                ((style.display.includes('flex') && style.flexDirection.startsWith('row')) ||
                    (style.display.includes('grid') && kids.length > 1 && this.#sharesRow(kids)));
            const before = horizontal ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2;
            const index = kids.indexOf(nearest);
            const beforeEl = before ? nearest : (kids[index + 1] ?? null);
            const line = horizontal
                ? {
                      left: (before ? rect.left : rect.right) + win.scrollX - 2,
                      top: rect.top + win.scrollY,
                      width: 4,
                      height: rect.height,
                  }
                : {
                      left: rect.left + win.scrollX,
                      top: (before ? rect.top : rect.bottom) + win.scrollY - 2,
                      width: rect.width,
                      height: 4,
                  };
            return { drop: { parentId, beforeId: beforeEl?.dataset.blockId ?? null }, line, container };
        }
        return null;
    }

    #sharesRow(kids: HTMLElement[]): boolean {
        const a = kids[0].getBoundingClientRect();
        const b = kids[1].getBoundingClientRect();
        return a.top < b.bottom && b.top < a.bottom;
    }
}
