/**
 * Crop session: the state and decisions behind the image cropper, free of Svelte and the DOM.
 *
 * The session owns zoom / rotation / flip / aspect state, the single "busy" decision for the UI,
 * the output-box maths and the encode step. It drives the cropping library through the narrow
 * `CropperAdapter` interface (real one: `cropperjs-adapter.ts`; tests use a fake).
 *
 * Views read `session.state` (immutable snapshots) and re-render on `subscribe`.
 */
import { encodeCrop, fitWithin, type CropCanvas, type EncodedCrop, type ImageTarget } from './image-compress';

/** What the session needs from a cropping library. */
export interface CropperAdapter {
    /** Zoom by a relative factor delta (0.1 = +10 %). */
    zoomBy(delta: number): void;
    rotateBy(degrees: number): void;
    flip(axis: 'x' | 'y'): void;
    /** Restores the image transform and selection to the initial fit. */
    resetView(): void;
    /** 0 = free selection. */
    setAspectRatio(ratio: number): void;
    /** Selection size in on-screen pixels plus the image's on-screen scale factor; null without a selection. */
    measureSelection(): { width: number; height: number; displayScale: number } | null;
    /** Renders the selection into a canvas `width` pixels wide. */
    renderSelection(width: number): Promise<CropCanvas>;
    destroy(): void;
}

export type CropStatus = 'loading' | 'ready' | 'error';

export interface CropSessionState {
    status: CropStatus;
    /** Percent, 100 = fitted. */
    zoom: number;
    /** Degrees. */
    rotation: number;
    scaleX: 1 | -1;
    scaleY: 1 | -1;
    /** null = free. */
    aspect: number | null;
    isUploading: boolean;
    isProcessing: boolean;
    /** True while controls must be disabled: not ready, uploading or processing. */
    busy: boolean;
    /** True when the loading overlay shows (loading, uploading or processing; never on error). */
    showOverlay: boolean;
}

export interface CropSessionOptions {
    target: ImageTarget;
    initialAspect?: number | null;
    /** Injectable for tests. */
    encode?: typeof encodeCrop;
}

export interface CropResult {
    file: File;
}

/** Output size in real image pixels: selection divided by display scale, fitted into the target box. */
export function cropOutputBox(
    selection: { width: number; height: number; displayScale: number },
    target: ImageTarget,
): { width: number; height: number } {
    const scale = selection.displayScale || 1;
    return fitWithin(selection.width / scale, selection.height / scale, target.maxWidth, target.maxHeight);
}

function normalizeAspect(ratio: number | null | undefined): number | null {
    return ratio === null || ratio === undefined || Number.isNaN(ratio) ? null : ratio;
}

export class CropSession {
    #adapter: CropperAdapter | null = null;
    #target: ImageTarget;
    #encode: typeof encodeCrop;
    #listeners = new Set<() => void>();
    #state: CropSessionState;

    constructor(options: CropSessionOptions) {
        this.#target = options.target;
        this.#encode = options.encode ?? encodeCrop;
        this.#state = this.#derive({
            status: 'loading',
            zoom: 100,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            aspect: normalizeAspect(options.initialAspect),
            isUploading: false,
            isProcessing: false,
        });
    }

    get state(): CropSessionState {
        return this.#state;
    }

    set target(target: ImageTarget) {
        this.#target = target;
    }

    subscribe(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    #derive(base: Omit<CropSessionState, 'busy' | 'showOverlay'>): CropSessionState {
        const busy = base.status !== 'ready' || base.isUploading || base.isProcessing;
        return { ...base, busy, showOverlay: base.status !== 'error' && busy };
    }

    #set(patch: Partial<Omit<CropSessionState, 'busy' | 'showOverlay'>>) {
        this.#state = this.#derive({ ...this.#state, ...patch });
        for (const listener of this.#listeners) listener();
    }

    /** The adapter, only while the controls are usable. */
    #idle(): CropperAdapter | null {
        return this.#adapter && !this.#state.busy ? this.#adapter : null;
    }

    setUploading(isUploading: boolean) {
        if (this.#state.isUploading !== isUploading) this.#set({ isUploading });
    }

    /** A new image is loading: drop the old cropper and reset transforms (aspect is kept). */
    begin() {
        this.release();
        this.#set({ status: 'loading', zoom: 100, rotation: 0, scaleX: 1, scaleY: 1 });
    }

    /** Hands over a freshly created cropper (not usable until `markReady`). */
    attach(adapter: CropperAdapter) {
        this.#adapter = adapter;
        adapter.setAspectRatio(this.#state.aspect ?? 0);
    }

    markReady() {
        if (this.#adapter) this.#set({ status: 'ready' });
    }

    fail() {
        this.#set({ status: 'error' });
    }

    /** Destroys the cropper; the session returns to loading unless it already failed. */
    release() {
        this.#adapter?.destroy();
        this.#adapter = null;
        if (this.#state.status === 'ready') this.#set({ status: 'loading' });
    }

    zoomIn() {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.zoomBy(0.1);
        this.#set({ zoom: Math.round(this.#state.zoom * 1.1) });
    }

    zoomOut() {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.zoomBy(-0.1);
        this.#set({ zoom: Math.max(10, Math.round(this.#state.zoom * 0.9)) });
    }

    zoomTo(percent: number) {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.zoomBy((percent - this.#state.zoom) / this.#state.zoom);
        this.#set({ zoom: percent });
    }

    rotate(degrees: 90 | -90) {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.rotateBy(degrees);
        this.#set({ rotation: (this.#state.rotation + degrees) % 360 });
    }

    rotateTo(degrees: number) {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.rotateBy(degrees - this.#state.rotation);
        this.#set({ rotation: degrees });
    }

    flip(axis: 'x' | 'y') {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.flip(axis);
        if (axis === 'x') this.#set({ scaleX: this.#state.scaleX === 1 ? -1 : 1 });
        else this.#set({ scaleY: this.#state.scaleY === 1 ? -1 : 1 });
    }

    /** Fit image, reset transforms and selection (keeps the chosen aspect). */
    fitReset() {
        const adapter = this.#idle();
        if (!adapter) return;
        adapter.resetView();
        adapter.setAspectRatio(this.#state.aspect ?? 0);
        this.#set({ zoom: 100, rotation: 0, scaleX: 1, scaleY: 1 });
    }

    setAspect(ratio: number | null) {
        const aspect = normalizeAspect(ratio);
        this.#adapter?.setAspectRatio(aspect ?? 0);
        this.#set({ aspect });
    }

    /** Renders and encodes the selection at source resolution (capped by the target). Null when not idle or on failure. */
    async crop(): Promise<CropResult | null> {
        const adapter = this.#idle();
        if (!adapter) return null;
        this.#set({ isProcessing: true });
        try {
            const selection = adapter.measureSelection();
            if (!selection) throw new Error('No crop selection found');
            const size = cropOutputBox(selection, this.#target);
            const canvas = await adapter.renderSelection(size.width);
            const encoded: EncodedCrop = await this.#encode(canvas, this.#target);
            const file = new File([encoded.blob], `cropped_image_${Date.now()}.${encoded.extension}`, {
                type: encoded.type,
            });
            return { file };
        } catch (error) {
            console.error('Error during image cropping:', error);
            return null;
        } finally {
            this.#set({ isProcessing: false });
        }
    }
}
