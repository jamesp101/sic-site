/**
 * The slide designer's editing session: the drafts of every Slide in the strip, the open Slide, the selected
 * Layer, undo history and dirty state, plus the commands that change them (Layer edits, Slide create / save /
 * reorder / duplicate / placement / delete). Plain TypeScript (no runes, no DOM, no `astro:*`): the component
 * subscribes with `onchange`, renders `view` and keeps focus, toasts and announcements.
 *
 * Invariants: the open Slide always names a draft that exists (or is null when there are none); the selected
 * Layer always belongs to the open Slide; a Slide holds at most MAX_LAYERS Layers; Layer geometry never leaves
 * `LAYER_LIMITS` through `patchSelected`. The carousel actions arrive as a {@link DesignerPort}; object URLs for
 * chosen image files as {@link ObjectUrls}.
 */
import {
    commit,
    createHistory,
    duplicateLayer,
    moveLayer,
    patchLayer,
    redo,
    undo,
    type Box,
    type History,
    type ZMove,
} from './carousel-editor';
import {
    MAX_LAYERS,
    newLayerId,
    serializeOverlay,
    type Layer,
    type MobileOverride,
    type SlideMobile,
} from './carousel-overlay';
import { resetMobile, setMobile } from './carousel-overlay-mobile';
import { LAYER_LIMITS, parseOverlayStrict } from './carousel-overlay-schema';
import type { DesignerSlide } from './server/slides';

export interface Draft {
    /** String(id) for saved slides, "new" for the one unsaved slide. */
    key: string;
    id: number | null;
    imageUrl: string | null;
    /** Replacement image chosen in the cropper, not uploaded yet. */
    file: File | null;
    previewUrl: string | null;
    departmentId: number | null;
    showOnMain: boolean;
    title: string;
    history: History<Layer[]>;
    /** Phone settings of the slide (photo focal point); null = centred. */
    mobile: SlideMobile | null;
    /** Background video: an uploaded file's URL or a YouTube link; '' = none. */
    video: string;
    /** `video` as last saved. */
    savedVideo: string;
    /** Serialized layers as last saved. */
    baseline: string;
    imageError: string;
}

/** One tile of the slide strip. */
export interface StripSlide {
    key: string;
    /** null while the slide has not been saved yet. */
    id: number | null;
    imageUrl: string | null;
    layers: Layer[];
    dirty: boolean;
    departmentId: number | null;
    showOnMain: boolean;
    title: string;
}

export interface DesignerView {
    drafts: Draft[];
    strip: StripSlide[];
    activeKey: string | null;
    active: Draft | null;
    /** Layers of the open Slide (empty without one). */
    layers: Layer[];
    selectedId: string | null;
    selected: Layer | null;
    /** Index of the selected Layer in `layers` (z-order), -1 without a selection. */
    selectedIndex: number;
    activeDirty: boolean;
    /** Unsaved changes in any Slide: guards leaving the page. */
    anyDirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
    saving: boolean;
    busy: boolean;
}

/** An action's outcome as the session needs it: data, or the message (and per-field messages) to show. */
export type PortResult<T = void> =
    | { ok: true; data: T }
    | { ok: false; message: string; fields: Record<string, string> };

export interface SlideSave {
    /** null creates the Slide. */
    id: number | null;
    /** Serialized overlay document. */
    overlay: string;
    image: File | null;
    video: string;
    departmentId: number | null;
    showOnMain: boolean;
}

export interface Placement {
    showOnMain?: boolean;
    departmentId?: number | null;
}

export interface DesignerPort {
    save(input: SlideSave): Promise<PortResult<DesignerSlide>>;
    reorder(ids: number[]): Promise<PortResult>;
    duplicate(id: number): Promise<PortResult<DesignerSlide>>;
    placement(id: number, patch: Placement): Promise<PortResult<Pick<DesignerSlide, 'departmentId' | 'showOnMain'>>>;
    remove(id: number): Promise<PortResult>;
}

export interface ObjectUrls {
    create(file: File): string;
    revoke(url: string): void;
}

export interface DesignerOptions {
    slides: DesignerSlide[];
    /** Slide to open first; the first Slide when it is missing. */
    initialId: number | null;
    port: DesignerPort;
    objectUrls: ObjectUrls;
    /** Department a new Slide starts in (null = main page). */
    newSlideDepartmentId: number | null;
    /** Called after every change of `view`. */
    onchange: () => void;
    clock?: () => number;
    newId?: () => string;
}

export type LayerAdd = { status: 'added'; id: string } | { status: 'noop' } | { status: 'full'; message: string };

export type SaveResult =
    | { status: 'saved' }
    /** Nothing to save. */
    | { status: 'noop' }
    /** The draft cannot be saved yet (no image, invalid design); nothing was sent. */
    | { status: 'invalid'; message: string }
    /** The server refused it; the draft is untouched. */
    | { status: 'failed'; message: string };

export type ReorderResult = { status: 'saved' } | { status: 'noop' } | { status: 'reverted'; message: string };

export type DuplicateResult =
    | {
          status: 'duplicated';
          key: string;
          /** The copy is of the saved version, not of unsaved edits. */ savedVersion: boolean;
      }
    | { status: 'noop' }
    | { status: 'failed'; message: string };

export type PlacementResult =
    | { status: 'saved' }
    | { status: 'local' }
    | { status: 'noop' }
    | { status: 'failed'; message: string };

export type DeleteResult = { status: 'deleted' } | { status: 'noop' } | { status: 'failed'; message: string };

const layerLimitMessage = `A slide can have at most ${MAX_LAYERS} layers.`;

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));

/** The Slide fields a draft takes from the server, mapped in one place for load, duplicate and save. */
function savedFields(slide: DesignerSlide) {
    return {
        key: String(slide.id),
        id: slide.id,
        imageUrl: slide.imageUrl,
        departmentId: slide.departmentId,
        showOnMain: slide.showOnMain,
        title: slide.title ?? '',
        mobile: slide.mobile,
        video: slide.video,
        savedVideo: slide.video,
    };
}

function fromSlide(slide: DesignerSlide): Draft {
    return {
        ...savedFields(slide),
        file: null,
        previewUrl: null,
        history: createHistory(slide.layers),
        baseline: serializeOverlay(slide.layers, slide.mobile),
        imageError: '',
    };
}

export const isDirty = (draft: Draft) =>
    draft.id === null ||
    draft.file !== null ||
    draft.video !== draft.savedVideo ||
    draft.baseline !== serializeOverlay(draft.history.present, draft.mobile);

/** An unsaved Slide only counts as a change once something was put into it. */
const hasChanges = (draft: Draft) =>
    draft.id === null ? draft.file !== null || draft.history.present.length > 0 : isDirty(draft);

/** Places the drafts whose ids are listed into the listed order, inside the positions those drafts occupy. */
function arrange(drafts: Draft[], ids: number[]): Draft[] {
    const byId = new Map(drafts.map((draft) => [draft.id, draft]));
    if (ids.some((id) => !byId.has(id))) return drafts;
    const next = [...drafts];
    drafts
        .flatMap((draft, index) => (draft.id !== null && ids.includes(draft.id) ? [index] : []))
        .forEach((position, index) => {
            next[position] = byId.get(ids[index]) as Draft;
        });
    return next;
}

function clampPatch(patch: Partial<Layer>): Partial<Layer> {
    const safe: Record<string, unknown> = { ...patch };
    for (const [field, limits] of Object.entries(LAYER_LIMITS)) {
        const value = safe[field];
        if (typeof value === 'number') safe[field] = clamp(value, limits);
    }
    return safe as Partial<Layer>;
}

/** Width/height a hand-placed phone layer stores, taken from its rendered box. */
function placedSize(layer: Layer, box: Box): MobileOverride {
    const size: MobileOverride = {};
    if (layer.type === 'text' || layer.type === 'shape' || layer.type === 'image') size.w = box.w;
    if (layer.type === 'shape' || layer.type === 'image') size.h = box.h;
    return size;
}

export class SlideDesignerSession {
    #drafts: Draft[];
    #activeKey: string | null;
    #selectedId: string | null = null;
    #saving = false;
    #busy = false;
    #view: DesignerView;

    constructor(private readonly options: DesignerOptions) {
        this.#drafts = options.slides.map(fromSlide);
        const wanted = options.initialId !== null ? String(options.initialId) : null;
        this.#activeKey = this.#drafts.some((draft) => draft.key === wanted) ? wanted : (this.#drafts[0]?.key ?? null);
        this.#view = this.#snapshot();
    }

    get view(): DesignerView {
        return this.#view;
    }

    /** Releases the object URLs of unsaved image choices. */
    dispose(): void {
        for (const draft of this.#drafts) if (draft.previewUrl) this.options.objectUrls.revoke(draft.previewUrl);
    }

    // ------------------------------------------------------------ selection

    /** Selects a Layer of the open Slide; an unknown id (or null) clears the selection. */
    select(id: string | null): void {
        this.#selectedId = id;
        this.#publish();
    }

    selectSlide(key: string): void {
        if (!this.#drafts.some((draft) => draft.key === key)) return;
        this.#activeKey = key;
        this.#selectedId = null;
        this.#publish();
    }

    // --------------------------------------------------------- Layer edits

    /** Edits the selected Layer; geometry is clamped to `LAYER_LIMITS`. Same `coalesceKey` edits merge into one undo step. */
    patchSelected(patch: Partial<Layer>, coalesceKey?: string): void {
        const { selected, layers } = this.#view;
        if (!selected) return;
        this.#applyLayers(
            patchLayer(layers, selected.id, clampPatch(patch)),
            coalesceKey ? `${selected.id}:${coalesceKey}` : undefined,
        );
    }

    /** Edits the selected Layer's phone overrides (keys set to undefined are removed). */
    patchMobile(patch: MobileOverride, coalesceKey?: string): void {
        const { selected, layers } = this.#view;
        if (!selected) return;
        this.#applyLayers(
            layers.map((layer) => (layer.id === selected.id ? setMobile(layer, patch) : layer)),
            coalesceKey ? `${selected.id}:m:${coalesceKey}` : undefined,
        );
    }

    /** Returns false when no Layer is selected. */
    resetSelectedMobile(): boolean {
        const { selected, layers } = this.#view;
        if (!selected) return false;
        this.#applyLayers(layers.map((layer) => (layer.id === selected.id ? resetMobile(layer) : layer)));
        return true;
    }

    /** Clears every phone override and the focal point of the open Slide. Returns false without an open Slide. */
    resetSlideMobile(): boolean {
        const { active } = this.#view;
        if (!active) return false;
        this.#update(active.key, (draft) => ({
            ...draft,
            mobile: null,
            history: commit(draft.history, draft.history.present.map(resetMobile), null, this.#now()),
        }));
        this.#publish();
        return true;
    }

    setFocus(focus: { x: number; y: number }): void {
        this.#update(this.#activeKey, (draft) => ({ ...draft, mobile: { focus } }));
        this.#publish();
    }

    /** Appends a Layer on top and selects it, unless the Slide is full. */
    addLayer(layer: Layer): LayerAdd {
        const { active, layers } = this.#view;
        if (!active) return { status: 'noop' };
        if (layers.length >= MAX_LAYERS) return { status: 'full', message: layerLimitMessage };
        this.#selectedId = layer.id;
        this.#applyLayers([...layers, layer]);
        return { status: 'added', id: layer.id };
    }

    /** Copies the selected Layer just above itself and selects the copy, unless the Slide is full. */
    duplicateSelected(): LayerAdd {
        const { selected, selectedIndex, layers } = this.#view;
        if (!selected) return { status: 'noop' };
        if (layers.length >= MAX_LAYERS) return { status: 'full', message: layerLimitMessage };
        const copy = duplicateLayer(selected, (this.options.newId ?? newLayerId)());
        const next = layers.slice();
        next.splice(selectedIndex + 1, 0, copy);
        this.#selectedId = copy.id;
        this.#applyLayers(next);
        return { status: 'added', id: copy.id };
    }

    /** Returns false when no Layer is selected. */
    removeSelected(): boolean {
        const { selected, layers } = this.#view;
        if (!selected) return false;
        this.#selectedId = null;
        this.#applyLayers(layers.filter((layer) => layer.id !== selected.id));
        return true;
    }

    moveSelected(move: ZMove): void {
        const { selected, layers } = this.#view;
        if (selected) this.#applyLayers(moveLayer(layers, selected.id, move));
    }

    /**
     * Moves the selected Layer by (dx, dy) percent, keeping it on the slide. On the phone layout pass the Layer's
     * rendered `box`: the move is then stored as a hand-placed phone position.
     */
    nudge(dx: number, dy: number, box?: Box): void {
        const { selected } = this.#view;
        if (!selected) return;
        if (box) {
            this.patchMobile(
                {
                    x: clamp(box.x + dx, [LAYER_LIMITS.x[0], LAYER_LIMITS.x[1] - box.w]),
                    y: clamp(box.y + dy, [LAYER_LIMITS.y[0], LAYER_LIMITS.y[1] - box.h]),
                    ...placedSize(selected, box),
                },
                'nudge',
            );
            return;
        }
        const maxX = 'w' in selected ? LAYER_LIMITS.x[1] - selected.w : LAYER_LIMITS.x[1];
        const maxY = 'h' in selected ? LAYER_LIMITS.y[1] - selected.h : LAYER_LIMITS.y[1];
        this.patchSelected(
            {
                x: clamp(selected.x + dx, [LAYER_LIMITS.x[0], maxX]),
                y: clamp(selected.y + dy, [LAYER_LIMITS.y[0], maxY]),
            },
            'nudge',
        );
    }

    undo(): void {
        this.#travel(undo);
    }

    redo(): void {
        this.#travel(redo);
    }

    /** Shows `layers` on the open Slide during a drag, without an undo step. Finish with {@link commitLive}. */
    live(layers: Layer[]): void {
        this.#update(this.#activeKey, (draft) => ({ ...draft, history: { ...draft.history, present: layers } }));
        this.#publish();
    }

    /** Makes the live state one undo step on top of `base`, the Layers before the drag. */
    commitLive(base: Layer[]): void {
        this.#update(this.#activeKey, (draft) => ({
            ...draft,
            history: commit({ ...draft.history, present: base }, draft.history.present, null, this.#now()),
        }));
        this.#publish();
    }

    // ----------------------------------------------------------- Slide edits

    /** Adds the one unsaved Slide and opens it. Returns false when there already is one. */
    addSlide(): boolean {
        if (this.#drafts.some((draft) => draft.id === null)) return false;
        this.#drafts = [
            ...this.#drafts,
            {
                key: 'new',
                id: null,
                imageUrl: null,
                file: null,
                previewUrl: null,
                departmentId: this.options.newSlideDepartmentId,
                showOnMain: true,
                title: '',
                history: createHistory<Layer[]>([]),
                mobile: null,
                video: '',
                savedVideo: '',
                baseline: serializeOverlay([]),
                imageError: '',
            },
        ];
        this.selectSlide('new');
        return true;
    }

    /** Sets (or clears) the replacement image of the open Slide. */
    setFile(file: File | null): void {
        this.#update(this.#activeKey, (draft) => {
            if (draft.previewUrl) this.options.objectUrls.revoke(draft.previewUrl);
            return { ...draft, file, previewUrl: file ? this.options.objectUrls.create(file) : null, imageError: '' };
        });
        this.#publish();
    }

    setVideo(video: string): void {
        this.#update(this.#activeKey, (draft) => ({ ...draft, video }));
        this.#publish();
    }

    /** Creates or updates the open Slide. On success the draft takes the saved fields and keeps the user's undo history. */
    async save(): Promise<SaveResult> {
        const draft = this.#view.active;
        if (!draft || this.#saving || (!this.#view.activeDirty && draft.id !== null)) return { status: 'noop' };
        this.#update(draft.key, (current) => ({ ...current, imageError: '' }));
        if (draft.id === null && !draft.file) {
            this.#update(draft.key, (current) => ({ ...current, imageError: 'Choose a slide image.' }));
            this.#selectedId = null;
            this.#publish();
            return { status: 'invalid', message: 'Choose a slide image before saving.' };
        }
        const overlay = serializeOverlay(draft.history.present, draft.mobile);
        const check = parseOverlayStrict(overlay);
        if (!check.ok) {
            this.#publish();
            return { status: 'invalid', message: check.error };
        }

        this.#saving = true;
        this.#publish();
        const result = await this.options.port.save({
            id: draft.id,
            overlay,
            image: draft.file,
            video: draft.video,
            departmentId: draft.departmentId,
            showOnMain: draft.showOnMain,
        });
        this.#saving = false;

        if (!result.ok) {
            const { fields, message } = result;
            if (fields.image) this.#update(draft.key, (current) => ({ ...current, imageError: fields.image }));
            this.#publish();
            return {
                status: 'failed',
                message: fields.overlay || fields.image || fields.video || message || 'The slide could not be saved.',
            };
        }

        const slide = result.data;
        this.#update(draft.key, (current) => {
            if (current.previewUrl) this.options.objectUrls.revoke(current.previewUrl);
            return {
                ...current,
                ...savedFields(slide),
                file: null,
                previewUrl: null,
                baseline: overlay,
                imageError: '',
            };
        });
        if (this.#activeKey === draft.key) this.#activeKey = String(slide.id);
        this.#publish();
        return { status: 'saved' };
    }

    /**
     * Applies a new order of saved Slides (`ids` in their new sequence) at once and saves it. When the server
     * refuses, the previous order comes back; edits made meanwhile stay.
     */
    async reorder(ids: number[]): Promise<ReorderResult> {
        const previous = this.#drafts.flatMap((draft) =>
            draft.id !== null && ids.includes(draft.id) ? [draft.id] : [],
        );
        const next = arrange(this.#drafts, ids);
        if (next === this.#drafts) return { status: 'noop' };
        this.#drafts = next;
        this.#publish();

        const result = await this.options.port.reorder(ids);
        if (!result.ok) {
            this.#drafts = arrange(this.#drafts, previous);
            this.#publish();
            return { status: 'reverted', message: result.message };
        }
        return { status: 'saved' };
    }

    /** Swaps a saved Slide with its neighbour in the strip and saves the order. */
    async moveSlide(key: string, direction: -1 | 1): Promise<ReorderResult> {
        const ids = this.#drafts.flatMap((draft) => (draft.id === null ? [] : [draft.id]));
        const from = ids.indexOf(Number(key));
        const to = from + direction;
        if (from < 0 || to < 0 || to >= ids.length) return { status: 'noop' };
        [ids[from], ids[to]] = [ids[to], ids[from]];
        return this.reorder(ids);
    }

    /** Copies a saved Slide on the server and opens the copy right after it. */
    async duplicateSlide(key: string): Promise<DuplicateResult> {
        const draft = this.#drafts.find((item) => item.key === key);
        if (!draft || draft.id === null || this.#busy) return { status: 'noop' };
        this.#busy = true;
        this.#publish();
        const result = await this.options.port.duplicate(draft.id);
        this.#busy = false;
        if (!result.ok) {
            this.#publish();
            return { status: 'failed', message: result.message };
        }
        const copy = fromSlide(result.data);
        const index = this.#drafts.findIndex((item) => item.key === key);
        this.#drafts = [...this.#drafts.slice(0, index + 1), copy, ...this.#drafts.slice(index + 1)];
        this.selectSlide(copy.key);
        return { status: 'duplicated', key: copy.key, savedVersion: isDirty(draft) };
    }

    /** Changes where a Slide is shown: saved at once for a saved Slide, kept in the draft for the unsaved one. */
    async placement(key: string, patch: Placement): Promise<PlacementResult> {
        const draft = this.#drafts.find((item) => item.key === key);
        if (!draft) return { status: 'noop' };
        if (draft.id === null) {
            this.#update(key, (current) => ({ ...current, ...patch }));
            this.#publish();
            return { status: 'local' };
        }
        this.#busy = true;
        this.#publish();
        const result = await this.options.port.placement(draft.id, patch);
        this.#busy = false;
        if (!result.ok) {
            this.#publish();
            return { status: 'failed', message: result.message };
        }
        const { departmentId, showOnMain } = result.data;
        this.#update(key, (current) => ({ ...current, departmentId, showOnMain }));
        this.#publish();
        return { status: 'saved' };
    }

    /** Deletes a Slide (on the server first when it is saved) and opens its neighbour when it was open. */
    async deleteSlide(key: string): Promise<DeleteResult> {
        const draft = this.#drafts.find((item) => item.key === key);
        if (!draft) return { status: 'noop' };
        if (draft.id !== null) {
            const result = await this.options.port.remove(draft.id);
            if (!result.ok) return { status: 'failed', message: result.message };
        }
        if (draft.previewUrl) this.options.objectUrls.revoke(draft.previewUrl);
        const index = this.#drafts.findIndex((item) => item.key === key);
        this.#drafts = this.#drafts.filter((item) => item.key !== key);
        if (this.#activeKey === key) {
            const neighbour = this.#drafts[Math.min(index, this.#drafts.length - 1)];
            this.#activeKey = neighbour?.key ?? null;
            this.#selectedId = null;
        }
        this.#publish();
        return { status: 'deleted' };
    }

    // -------------------------------------------------------------- internals

    #now(): number {
        return (this.options.clock ?? Date.now)();
    }

    #update(key: string | null, change: (draft: Draft) => Draft): void {
        this.#drafts = this.#drafts.map((draft) => (draft.key === key ? change(draft) : draft));
    }

    #applyLayers(next: Layer[], coalesceKey?: string): void {
        this.#update(this.#activeKey, (draft) => ({
            ...draft,
            history: commit(draft.history, next, coalesceKey ?? null, this.#now()),
        }));
        this.#publish();
    }

    #travel(change: (history: History<Layer[]>) => History<Layer[]>): void {
        this.#update(this.#activeKey, (draft) => ({ ...draft, history: change(draft.history) }));
        this.#publish();
    }

    #snapshot(): DesignerView {
        const active = this.#drafts.find((draft) => draft.key === this.#activeKey) ?? null;
        const layers = active?.history.present ?? [];
        const selectedIndex = layers.findIndex((layer) => layer.id === this.#selectedId);
        const dirty = this.#drafts.map(isDirty);
        return {
            drafts: this.#drafts,
            strip: this.#drafts.map((draft, index) => ({
                key: draft.key,
                id: draft.id,
                imageUrl: draft.previewUrl ?? draft.imageUrl,
                layers: draft.history.present,
                dirty: dirty[index],
                departmentId: draft.departmentId,
                showOnMain: draft.showOnMain,
                title: draft.title,
            })),
            activeKey: this.#activeKey,
            active,
            layers,
            selectedId: selectedIndex >= 0 ? this.#selectedId : null,
            selected: selectedIndex >= 0 ? layers[selectedIndex] : null,
            selectedIndex,
            activeDirty: active ? dirty[this.#drafts.indexOf(active)] : false,
            anyDirty: this.#drafts.some(hasChanges),
            canUndo: (active?.history.past.length ?? 0) > 0,
            canRedo: (active?.history.future.length ?? 0) > 0,
            saving: this.#saving,
            busy: this.#busy,
        };
    }

    #publish(): void {
        this.#view = this.#snapshot();
        this.#selectedId = this.#view.selectedId;
        this.options.onchange();
    }
}
