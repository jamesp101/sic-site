import { describe, expect, it } from 'vite-plus/test';
import { MAX_LAYERS, defaultLayer, type Layer } from './carousel-overlay';
import { LAYER_LIMITS } from './carousel-overlay-schema';
import type { DesignerSlide } from './designer-slide';
import {
    SlideDesignerSession,
    type DesignerPort,
    type ObjectUrls,
    type PortResult,
    type SlideSave,
} from './slide-designer-session';

const ok = <T>(data: T): PortResult<T> => ({ ok: true, data });
const refused = (message: string, fields: Record<string, string> = {}): PortResult<never> => ({
    ok: false,
    message,
    fields,
});

function slide(id: number, layers: Layer[] = [], extra: Partial<DesignerSlide> = {}): DesignerSlide {
    return {
        id,
        imageUrl: `/img/${id}.webp`,
        title: null,
        order: id,
        departmentId: null,
        showOnMain: true,
        layers,
        mobile: null,
        video: '',
        videoKind: null,
        ...extra,
    };
}

const text = (id: string, extra: Partial<Layer> = {}) => ({ ...defaultLayer('text'), id, ...extra }) as Layer;

function setup(slides: DesignerSlide[], port: Partial<DesignerPort> = {}, initialId: number | null = null) {
    let now = 0;
    let n = 0;
    const urls = { created: [] as string[], revoked: [] as string[] };
    const objectUrls: ObjectUrls = {
        create: () => {
            const url = `blob:${urls.created.length}`;
            urls.created.push(url);
            return url;
        },
        revoke: (url) => urls.revoked.push(url),
    };
    const unused = () => Promise.reject(new Error('port call not expected'));
    const session = new SlideDesignerSession({
        slides,
        initialId,
        newSlideDepartmentId: 7,
        port: { save: unused, reorder: unused, duplicate: unused, placement: unused, remove: unused, ...port },
        objectUrls,
        onchange: () => {},
        clock: () => now,
        newId: () => `copy${++n}`,
    });
    return { session, urls, advance: (ms: number) => (now += ms) };
}

const ids = (session: SlideDesignerSession) => session.view.layers.map((layer) => layer.id);
const order = (session: SlideDesignerSession) => session.view.drafts.map((draft) => draft.key);
const file = () => new File(['x'], 'a.webp');

describe('opening', () => {
    it('opens the requested slide, or the first when it is missing', () => {
        expect(setup([slide(1), slide(2)], {}, 2).session.view.activeKey).toBe('2');
        expect(setup([slide(1), slide(2)], {}, 9).session.view.activeKey).toBe('1');
        expect(setup([]).session.view.active).toBeNull();
    });
});

describe('Layer limits', () => {
    it('clamps geometry to the schema limits', () => {
        const { session } = setup([slide(1, [text('a')])]);
        session.select('a');
        session.patchSelected({ x: -5, y: 140, w: 0, rotation: 400 });
        const layer = session.view.selected as Layer & { w: number };
        expect([layer.x, layer.y, layer.w, layer.rotation]).toEqual([
            LAYER_LIMITS.x[0],
            LAYER_LIMITS.y[1],
            LAYER_LIMITS.w[0],
            LAYER_LIMITS.rotation[1],
        ]);
    });

    it('refuses a layer beyond MAX_LAYERS, for add and duplicate', () => {
        const full = Array.from({ length: MAX_LAYERS }, (_, i) => text(`l${i}`));
        const { session } = setup([slide(1, full)]);
        expect(session.addLayer(text('extra')).status).toBe('full');
        session.select('l0');
        expect(session.duplicateSelected().status).toBe('full');
        expect(session.view.layers).toHaveLength(MAX_LAYERS);
        expect(session.view.canUndo).toBe(false);
    });

    it('keeps a nudged layer on the slide', () => {
        const { session } = setup([slide(1, [text('a', { x: 1, y: 99 })])]);
        session.select('a');
        session.nudge(-5, 0);
        expect(session.view.selected?.x).toBe(0);
        session.nudge(0, 5);
        expect(session.view.selected?.y).toBe(100);
    });

    it('stores a phone nudge as a position inside the slide', () => {
        const { session } = setup([slide(1, [text('a')])]);
        session.select('a');
        session.nudge(10, -50, { x: 5, y: 10, w: 40, h: 10 });
        expect(session.view.selected?.mobile).toMatchObject({ x: 15, y: 0, w: 40 });
    });
});

describe('Layer commands', () => {
    it('adds a layer on top and selects it', () => {
        const { session } = setup([slide(1, [text('a')])]);
        expect(session.addLayer(text('b'))).toEqual({ status: 'added', id: 'b' });
        expect(ids(session)).toEqual(['a', 'b']);
        expect(session.view.selectedId).toBe('b');
    });

    it('duplicates just above the original with a fresh id and selects the copy', () => {
        const { session } = setup([slide(1, [text('a', { x: 10, y: 10 }), text('b')])]);
        session.select('a');
        expect(session.duplicateSelected()).toEqual({ status: 'added', id: 'copy1' });
        expect(ids(session)).toEqual(['a', 'copy1', 'b']);
        expect(session.view.selected).toMatchObject({ id: 'copy1', x: 12, y: 13 });
    });

    it('deleting clears the selection and undo brings the layer back', () => {
        const { session } = setup([slide(1, [text('a')])]);
        session.select('a');
        expect(session.removeSelected()).toBe(true);
        expect(session.view.layers).toEqual([]);
        expect(session.view.selectedId).toBeNull();
        session.undo();
        expect(ids(session)).toEqual(['a']);
        expect(session.view.selectedId).toBeNull();
    });

    it('undo drops a selection whose layer disappears', () => {
        const { session } = setup([slide(1)]);
        session.addLayer(text('a'));
        expect(session.view.selectedId).toBe('a');
        session.undo();
        expect(session.view.selectedId).toBeNull();
    });

    it('merges same-key edits within the window into one undo step', () => {
        const { session, advance } = setup([slide(1, [text('a', { x: 10 })])]);
        session.select('a');
        session.patchSelected({ x: 11 }, 'drag');
        advance(100);
        session.patchSelected({ x: 12 }, 'drag');
        session.undo();
        expect(session.view.selected?.x).toBe(10);
    });

    it('a drag is one undo step', () => {
        const base = [text('a', { x: 10 })];
        const { session } = setup([slide(1, base)]);
        session.live([text('a', { x: 20 })]);
        session.live([text('a', { x: 30 })]);
        session.commitLive(base);
        expect(session.view.layers[0].x).toBe(30);
        session.undo();
        expect(session.view.layers[0].x).toBe(10);
    });
});

describe('dirty state', () => {
    it('is clean until a layer changes and clean again after reverting it', () => {
        const { session } = setup([slide(1, [text('a', { x: 10 })])]);
        expect([session.view.activeDirty, session.view.anyDirty]).toEqual([false, false]);
        session.select('a');
        session.patchSelected({ x: 20 });
        expect([session.view.activeDirty, session.view.anyDirty]).toEqual([true, true]);
        expect(session.view.strip[0].dirty).toBe(true);
        session.undo();
        expect([session.view.activeDirty, session.view.anyDirty]).toEqual([false, false]);
    });

    it('counts a chosen file or video change, and an empty new slide only once it has content', () => {
        const { session } = setup([slide(1), slide(2)]);
        session.setVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(session.view.anyDirty).toBe(true);
        session.setVideo('');
        expect(session.view.anyDirty).toBe(false);

        session.addSlide();
        expect(session.view.activeDirty).toBe(true);
        expect(session.view.anyDirty).toBe(false);
        session.setFile(file());
        expect(session.view.anyDirty).toBe(true);
    });

    it('allows one unsaved slide and starts it in the configured department', () => {
        const { session } = setup([slide(1)]);
        expect(session.addSlide()).toBe(true);
        expect(session.addSlide()).toBe(false);
        expect(session.view.active).toMatchObject({ key: 'new', id: null, departmentId: 7 });
    });
});

describe('save', () => {
    it('reconciles the draft with the saved slide and keeps undo history', async () => {
        const saves: SlideSave[] = [];
        const { session, urls } = setup([slide(1)], {
            save: async (input) => {
                saves.push(input);
                return ok(slide(9, [], { title: 'Hi', departmentId: 3, video: '/v.mp4' }));
            },
        });
        session.addSlide();
        session.setFile(file());
        session.addLayer(text('a'));
        const result = await session.save();

        expect(result).toEqual({ status: 'saved' });
        expect(saves[0]).toMatchObject({ id: null, departmentId: 7, showOnMain: true });
        expect(JSON.parse(saves[0].overlay).layers).toHaveLength(1);
        expect(session.view.activeKey).toBe('9');
        expect(session.view.active).toMatchObject({
            key: '9',
            id: 9,
            title: 'Hi',
            departmentId: 3,
            video: '/v.mp4',
            savedVideo: '/v.mp4',
            file: null,
            previewUrl: null,
        });
        expect(urls.revoked).toEqual(['blob:0']);
        expect(session.view.activeDirty).toBe(false);
        expect(session.view.layers).toHaveLength(1);
        expect(session.view.canUndo).toBe(true);
        expect(session.view.saving).toBe(false);
    });

    it('does not send a new slide without an image', async () => {
        const { session } = setup([]);
        session.addSlide();
        session.addLayer(text('a'));
        expect(await session.save()).toEqual({ status: 'invalid', message: 'Choose a slide image before saving.' });
        expect(session.view.active?.imageError).toBe('Choose a slide image.');
        expect(session.view.selectedId).toBeNull();
    });

    it('does not send an invalid design', async () => {
        const { session } = setup([slide(1, [text('a')])]);
        session.select('a');
        session.patchSelected({ text: '' } as Partial<Layer>);
        const result = await session.save();
        expect(result.status).toBe('invalid');
    });

    it('keeps the draft and reports the most specific field error when the server refuses', async () => {
        const { session } = setup([slide(1)], {
            save: async () => refused('Invalid input', { image: 'Image too large.' }),
        });
        session.setVideo('/v.mp4');
        expect(await session.save()).toEqual({ status: 'failed', message: 'Image too large.' });
        expect(session.view.active).toMatchObject({
            id: 1,
            video: '/v.mp4',
            savedVideo: '',
            imageError: 'Image too large.',
        });
        expect(session.view.activeDirty).toBe(true);
        expect(session.view.saving).toBe(false);
    });

    it('does nothing for a clean saved slide', async () => {
        const { session } = setup([slide(1)]);
        expect(await session.save()).toEqual({ status: 'noop' });
    });
});

describe('reorder', () => {
    const three = () => [slide(1), slide(2), slide(3)];

    it('shows the new order at once and keeps it when saved', async () => {
        let seen: string[] = [];
        const gate = Promise.withResolvers<void>();
        const { session } = setup(three(), {
            reorder: async () => {
                seen = order(session);
                await gate.promise;
                return ok(undefined);
            },
        });
        const pending = session.reorder([3, 1, 2]);
        expect(seen).toEqual(['3', '1', '2']);
        gate.resolve();
        expect(await pending).toEqual({ status: 'saved' });
        expect(order(session)).toEqual(['3', '1', '2']);
    });

    it('rolls the order back when the server refuses, keeping edits made meanwhile', async () => {
        const gate = Promise.withResolvers<void>();
        const { session } = setup(three(), {
            reorder: async () => {
                await gate.promise;
                return refused('Not allowed');
            },
        });
        const pending = session.reorder([2, 3, 1]);
        session.setVideo('/v.mp4');
        gate.resolve();
        expect(await pending).toEqual({ status: 'reverted', message: 'Not allowed' });
        expect(order(session)).toEqual(['1', '2', '3']);
        expect(session.view.drafts[0].video).toBe('/v.mp4');
    });

    it('reorders only among saved slides and leaves the unsaved one in place', async () => {
        const { session } = setup([slide(1), slide(2)], { reorder: async () => ok(undefined) });
        session.addSlide();
        await session.reorder([2, 1]);
        expect(order(session)).toEqual(['2', '1', 'new']);
    });

    it('moves a slide by one place and ignores moves off the ends', async () => {
        const sent: number[][] = [];
        const { session } = setup(three(), { reorder: async (list) => (sent.push(list), ok(undefined)) });
        expect((await session.moveSlide('1', -1)).status).toBe('noop');
        expect((await session.moveSlide('3', 1)).status).toBe('noop');
        expect((await session.moveSlide('1', 1)).status).toBe('saved');
        expect(sent).toEqual([[2, 1, 3]]);
    });
});

describe('slides', () => {
    it('opens a duplicate right after the original and says when it is the saved version', async () => {
        const { session } = setup([slide(1), slide(2)], { duplicate: async () => ok(slide(5)) });
        session.setVideo('/v.mp4');
        const result = await session.duplicateSlide('1');
        expect(result).toEqual({ status: 'duplicated', key: '5', savedVersion: true });
        expect(order(session)).toEqual(['1', '5', '2']);
        expect(session.view.activeKey).toBe('5');
        expect(session.view.busy).toBe(false);
    });

    it('saves the placement of a saved slide and keeps it local for an unsaved one', async () => {
        const sent: unknown[] = [];
        const { session } = setup([slide(1)], {
            placement: async (id, patch) => (sent.push([id, patch]), ok({ departmentId: 4, showOnMain: false })),
        });
        expect(await session.placement('1', { showOnMain: false, departmentId: 4 })).toEqual({ status: 'saved' });
        expect(session.view.drafts[0]).toMatchObject({ departmentId: 4, showOnMain: false });
        session.addSlide();
        expect(await session.placement('new', { showOnMain: false })).toEqual({ status: 'local' });
        expect(session.view.active?.showOnMain).toBe(false);
        expect(sent).toHaveLength(1);
    });

    it('keeps a slide whose server delete fails', async () => {
        const { session } = setup([slide(1), slide(2)], { remove: async () => refused('Nope') });
        expect(await session.deleteSlide('1')).toEqual({ status: 'failed', message: 'Nope' });
        expect(order(session)).toEqual(['1', '2']);
    });

    it('opens the neighbour after deleting the open slide and releases its preview', async () => {
        const { session, urls } = setup([slide(1), slide(2), slide(3)], { remove: async () => ok(undefined) }, 2);
        session.setFile(file());
        session.addLayer(text('a'));
        await session.deleteSlide('2');
        expect(order(session)).toEqual(['1', '3']);
        expect(session.view.activeKey).toBe('3');
        expect(session.view.selectedId).toBeNull();
        expect(urls.revoked).toEqual(['blob:0']);
        await session.deleteSlide('3');
        await session.deleteSlide('1');
        expect(session.view.active).toBeNull();
    });

    it('replacing the chosen file releases the previous preview', () => {
        const { session, urls } = setup([slide(1)]);
        session.setFile(file());
        session.setFile(file());
        expect(urls.revoked).toEqual(['blob:0']);
        session.dispose();
        expect(urls.revoked).toEqual(['blob:0', 'blob:1']);
    });
});
