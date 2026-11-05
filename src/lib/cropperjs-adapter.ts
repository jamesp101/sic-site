/** cropperjs v2 implementation of `CropperAdapter`. Browser only. */
import type Cropper from 'cropperjs';
import type { CropperAdapter } from './crop-session';

export interface CropperjsHandle {
    adapter: CropperAdapter;
    /** Resolves when the image is decoded and placed; rejects if it cannot be. */
    ready: Promise<void>;
}

/** Creates a cropper on `imageEl`. cropperjs defines custom elements at import time, so it loads lazily. */
export async function createCropperjsAdapter(imageEl: HTMLImageElement): Promise<CropperjsHandle> {
    const { default: CropperClass } = await import('cropperjs');
    const cropper: Cropper = new CropperClass(imageEl, { container: imageEl.parentElement ?? undefined });

    const canvas = cropper.getCropperCanvas();
    if (canvas) canvas.themeColor = getComputedStyle(document.documentElement).getPropertyValue('--gold-500').trim();

    const image = () => cropper.getCropperImage();
    const selection = () => cropper.getCropperSelection();

    const adapter: CropperAdapter = {
        zoomBy: (delta) => void image()?.$zoom(delta),
        rotateBy: (degrees) => void image()?.$rotate(`${degrees}deg`),
        flip: (axis) => void (axis === 'x' ? image()?.$scale(-1, 1) : image()?.$scale(1, -1)),
        resetView() {
            const img = image();
            if (img) {
                img.$resetTransform();
                img.$center();
            }
            selection()?.$reset();
        },
        setAspectRatio(ratio) {
            const sel = selection();
            if (sel) sel.aspectRatio = ratio;
        },
        measureSelection() {
            const sel = selection();
            if (!sel) return null;
            const [a = 1, b = 0] = image()?.$getTransform() ?? [];
            return { width: sel.width, height: sel.height, displayScale: Math.hypot(a, b) || 1 };
        },
        async renderSelection(width) {
            const sel = selection();
            if (!sel) throw new Error('No crop selection found');
            return sel.$toCanvas({ width });
        },
        destroy: () => cropper.destroy(),
    };

    const cropperImage = image();
    const ready = cropperImage ? cropperImage.$ready().then(() => undefined) : Promise.resolve();
    return { adapter, ready };
}
