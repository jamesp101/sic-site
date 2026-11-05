import { describe, expect, it, vi } from 'vite-plus/test';
import { CropSession, cropOutputBox, type CropperAdapter } from './crop-session';
import { IMAGE_TARGETS, encodeCrop, type CropCanvas } from './image-compress';

function fakeAdapter(measure = { width: 400, height: 300, displayScale: 0.5 }) {
    const calls: string[] = [];
    const canvas = { width: 0, height: 0, toBlob: () => {} } as unknown as CropCanvas;
    const adapter: CropperAdapter = {
        zoomBy: (d) => calls.push(`zoom:${d}`),
        rotateBy: (d) => calls.push(`rotate:${d}`),
        flip: (a) => calls.push(`flip:${a}`),
        resetView: () => calls.push('reset'),
        setAspectRatio: (r) => calls.push(`aspect:${r}`),
        measureSelection: () => measure,
        renderSelection: async (w) => {
            calls.push(`render:${w}`);
            return canvas;
        },
        destroy: () => calls.push('destroy'),
    };
    return { adapter, calls, canvas };
}

function readySession(options: { aspect?: number | null; encode?: typeof encodeCrop } = {}) {
    const fake = fakeAdapter();
    const session = new CropSession({
        target: IMAGE_TARGETS.slide,
        initialAspect: options.aspect,
        encode: options.encode,
    });
    session.attach(fake.adapter);
    session.markReady();
    return { session, ...fake };
}

describe('transform state', () => {
    it('zooms in/out relative to the current percentage and clamps at 10', () => {
        const { session, calls } = readySession();
        session.zoomIn();
        expect(session.state.zoom).toBe(110);
        session.zoomTo(220);
        expect(session.state.zoom).toBe(220);
        session.zoomOut();
        expect(session.state.zoom).toBe(198);
        expect(calls).toContain('zoom:0.1');
        expect(calls).toContain('zoom:1');
        session.zoomTo(10);
        for (let i = 0; i < 20; i++) session.zoomOut();
        expect(session.state.zoom).toBe(10);
    });

    it('rotates in 90 degree steps and to an absolute angle', () => {
        const { session, calls } = readySession();
        session.rotate(90);
        session.rotate(90);
        session.rotate(90);
        session.rotate(90);
        expect(session.state.rotation).toBe(0);
        session.rotate(-90);
        expect(session.state.rotation).toBe(-90);
        session.rotateTo(45);
        expect(session.state.rotation).toBe(45);
        expect(calls).toContain('rotate:135');
    });

    it('toggles flips per axis', () => {
        const { session, calls } = readySession();
        session.flip('x');
        expect([session.state.scaleX, session.state.scaleY]).toEqual([-1, 1]);
        session.flip('y');
        session.flip('x');
        expect([session.state.scaleX, session.state.scaleY]).toEqual([1, -1]);
        expect(calls.filter((c) => c.startsWith('flip:'))).toEqual(['flip:x', 'flip:y', 'flip:x']);
    });

    it('fitReset restores transforms and keeps the aspect', () => {
        const { session, calls } = readySession({ aspect: 4 / 3 });
        session.zoomIn();
        session.rotate(90);
        session.flip('y');
        session.fitReset();
        expect(session.state).toMatchObject({ zoom: 100, rotation: 0, scaleX: 1, scaleY: 1, aspect: 4 / 3 });
        expect(calls.at(-2)).toBe('reset');
        expect(calls.at(-1)).toBe(`aspect:${4 / 3}`);
    });

    it('applies aspect on attach and on change; null and NaN mean free', () => {
        const { session, calls } = readySession({ aspect: 1 });
        expect(calls[0]).toBe('aspect:1');
        session.setAspect(null);
        session.setAspect(Number.NaN);
        expect(calls.slice(-2)).toEqual(['aspect:0', 'aspect:0']);
        expect(session.state.aspect).toBeNull();
    });
});

describe('busy state', () => {
    it('is busy until ready, with the overlay showing', () => {
        const session = new CropSession({ target: IMAGE_TARGETS.slide });
        expect(session.state).toMatchObject({ status: 'loading', busy: true, showOverlay: true });
        const { adapter } = fakeAdapter();
        session.attach(adapter);
        expect(session.state.busy).toBe(true);
        session.markReady();
        expect(session.state).toMatchObject({ busy: false, showOverlay: false });
    });

    it('ignores actions while busy', () => {
        const session = new CropSession({ target: IMAGE_TARGETS.slide });
        const { adapter, calls } = fakeAdapter();
        session.attach(adapter);
        session.zoomIn();
        session.flip('x');
        expect(calls).toEqual(['aspect:0']);
        session.markReady();
        session.setUploading(true);
        session.zoomIn();
        expect(session.state).toMatchObject({ busy: true, showOverlay: true, zoom: 100 });
        session.setUploading(false);
        expect(session.state.busy).toBe(false);
    });

    it('error hides the overlay but stays busy', () => {
        const session = new CropSession({ target: IMAGE_TARGETS.slide });
        session.fail();
        expect(session.state).toMatchObject({ status: 'error', busy: true, showOverlay: false });
    });

    it('is processing during crop and idle again afterwards', async () => {
        const seen: boolean[] = [];
        const { session } = readySession({
            encode: async () => {
                seen.push(session.state.busy);
                return { blob: new Blob(['x']), type: 'image/webp', extension: 'webp' };
            },
        });
        const result = await session.crop();
        expect(seen).toEqual([true]);
        expect(result?.file.type).toBe('image/webp');
        expect(result?.file.name).toMatch(/^cropped_image_\d+\.webp$/);
        expect(session.state).toMatchObject({ isProcessing: false, busy: false });
    });

    it('crop returns null and recovers when encoding fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { session } = readySession({
            encode: async () => {
                throw new Error('boom');
            },
        });
        expect(await session.crop()).toBeNull();
        expect(session.state.busy).toBe(false);
        error.mockRestore();
    });

    it('release destroys the cropper and returns to loading', () => {
        const { session, calls } = readySession();
        session.release();
        expect(calls).toContain('destroy');
        expect(session.state).toMatchObject({ status: 'loading', busy: true });
    });

    it('notifies subscribers on change', () => {
        const { session } = readySession();
        const listener = vi.fn();
        const off = session.subscribe(listener);
        session.zoomIn();
        expect(listener).toHaveBeenCalledTimes(1);
        off();
        session.zoomIn();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('output box', () => {
    it('divides the selection by the display scale and fits into each target', () => {
        for (const target of Object.values(IMAGE_TARGETS)) {
            // 4000 x 3000 real pixels shown at 25 %.
            const box = cropOutputBox({ width: 1000, height: 750, displayScale: 0.25 }, target);
            const scale = Math.min(1, target.maxWidth / 4000, target.maxHeight / 3000);
            expect(box).toEqual({ width: Math.round(4000 * scale), height: Math.round(3000 * scale) });
            expect(box.width).toBeLessThanOrEqual(target.maxWidth);
            expect(box.height).toBeLessThanOrEqual(target.maxHeight);
        }
    });

    it('never upscales a small crop', () => {
        expect(cropOutputBox({ width: 100, height: 50, displayScale: 1 }, IMAGE_TARGETS.logo)).toEqual({
            width: 100,
            height: 50,
        });
    });

    it('passes the output width to the adapter', async () => {
        const { session, calls } = readySession({
            encode: async () => ({ blob: new Blob(['x']), type: 'image/webp', extension: 'webp' }),
        });
        await session.crop();
        // 400x300 at 0.5 => 800x600, inside the 1920x1080 slide box.
        expect(calls).toContain('render:800');
    });
});

describe('encodeCrop', () => {
    const canvas = (blob: Blob | null) =>
        ({ width: 10, height: 10, toBlob: (cb: BlobCallback) => cb(blob) }) as unknown as CropCanvas;

    it('uses WebP when available', async () => {
        const blob = new Blob(['w'], { type: 'image/webp' });
        const result = await encodeCrop(canvas(null), IMAGE_TARGETS.slide, async () => ({
            blob,
            width: 10,
            height: 10,
            resized: false,
        }));
        expect(result).toEqual({ blob, type: 'image/webp', extension: 'webp' });
    });

    it('falls back to JPEG when WebP cannot be encoded', async () => {
        const jpeg = new Blob(['j'], { type: 'image/jpeg' });
        const result = await encodeCrop(canvas(jpeg), IMAGE_TARGETS.slide, async () => null);
        expect(result).toEqual({ blob: jpeg, type: 'image/jpeg', extension: 'jpg' });
    });

    it('throws when neither format encodes', async () => {
        await expect(encodeCrop(canvas(null), IMAGE_TARGETS.slide, async () => null)).rejects.toThrow(
            'Failed to encode',
        );
    });
});
