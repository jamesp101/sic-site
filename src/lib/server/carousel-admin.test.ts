import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { serializeOverlay } from '../carousel-overlay';
import type { PrismaClient } from '../../generated/prisma/client';
import type * as CarouselAdmin from './carousel-admin';
import { setWelcomeHero } from './welcome-hero';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const dir = mkdtempSync(path.join(tmpdir(), 'sic-carousel-uploads-'));
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = dir;

let admin: typeof CarouselAdmin;
let db: PrismaClient;

// The storage driver reads UPLOAD_DIR when its module loads, so the modules load after the env is set.
beforeAll(async () => {
    admin = await import('./carousel-admin');
    db = (await import('./db')).db as unknown as PrismaClient;
});
afterAll(async () => {
    await (await import('./test-db')).closeTestDb();
    rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => {
    await db.carouselItem.deleteMany();
    await db.setting.deleteMany();
});

let counter = 0;
/** A stored object under `key` (or a fresh `videos/<hex>.mp4`), returned as its bare key. */
function stored(key = `videos/${(++counter).toString(16).padStart(32, '0')}.mp4`) {
    mkdirSync(path.dirname(path.join(dir, key)), { recursive: true });
    writeFileSync(path.join(dir, key), 'x');
    return key;
}
const has = (key: string) => existsSync(path.join(dir, key));
const none = { videoPath: null, videoUrl: null };
const content = { overlay: null, title: null, subtitle: null, linkUrl: null };

async function slide(data: { videoPath?: string | null; videoUrl?: string | null } = {}) {
    return db.carouselItem.create({ data: { imagePath: stored(`carousels/${++counter}.webp`), ...data } });
}

describe('parseSlideVideo', () => {
    const KEY = 'videos/0123456789abcdef0123456789abcdef.mp4';

    test('empty means no video', () => {
        expect(admin.parseSlideVideo('')).toEqual({ ok: true, video: none });
        expect(admin.parseSlideVideo('   ')).toEqual({ ok: true, video: none });
    });

    test('one of our uploads becomes videoPath', () => {
        expect(admin.parseSlideVideo(`/storage/${KEY}`)).toEqual({
            ok: true,
            video: { videoPath: KEY, videoUrl: null },
        });
        expect(admin.parseSlideVideo('/storage/videos/0123456789abcdef0123456789abcdef.webm')).toMatchObject({
            ok: true,
            video: { videoPath: 'videos/0123456789abcdef0123456789abcdef.webm' },
        });
    });

    test('YouTube links become a canonical videoUrl', () => {
        const expected = {
            ok: true,
            video: { videoPath: null, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        };
        for (const url of [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://youtu.be/dQw4w9WgXcQ',
            'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
            'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        ])
            expect(admin.parseSlideVideo(url)).toEqual(expected);
    });

    test('everything else is rejected', () => {
        for (const url of [
            'https://vimeo.com/123456789',
            'https://example.com/clip.mp4',
            '/storage/carousels/a.webp',
            '/storage/videos/0123456789abcdef0123456789abcdef.exe',
            '/storage/videos/../secret.mp4',
            'javascript:alert(1)',
            'not a url',
        ])
            expect(admin.parseSlideVideo(url), url).toMatchObject({ ok: false });
    });
});

describe('claimSlideVideo', () => {
    const claim = async (raw: string, slideId?: number) => {
        const result = await admin.claimSlideVideo(raw, slideId);
        return result.ok ? null : result.error;
    };

    test('a missing file cannot be adopted', async () => {
        expect(await claim('/storage/videos/ffffffffffffffffffffffffffffffff.mp4')).toMatch(/not found/);
    });

    test('a video another slide or some content uses cannot be adopted; the owner may keep it', async () => {
        const key = stored();
        const url = `/storage/${key}`;
        const owner = await slide({ videoPath: key });
        expect(await claim(url)).toMatch(/already used/);
        expect(await claim(url, owner.id + 1)).toMatch(/already used/);
        expect(await claim(url, owner.id)).toBeNull();

        const free = stored();
        expect(await claim(`/storage/${free}`)).toBeNull();
        await setWelcomeHero(`{"url":"/storage/${free}"}`);
        expect(await claim(`/storage/${free}`)).toMatch(/already used/);
    });

    test('no video and a YouTube link need no file', async () => {
        expect(await admin.claimSlideVideo('')).toEqual({ ok: true, video: none });
        expect(await claim('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    });
});

const photo = () => new File([new Uint8Array([1, 2, 3])], 'photo.webp', { type: 'image/webp' });

describe('createSlide', () => {
    test('stores the photo, adopts the video and goes last', async () => {
        await db.carouselItem.create({ data: { imagePath: stored(`carousels/${++counter}.webp`), order: 5 } });
        const key = stored();
        const created = await admin.createSlide({
            content,
            image: photo(),
            video: { videoPath: key, videoUrl: null },
            departmentId: null,
            showOnMain: true,
        });
        expect(created).toMatchObject({ videoPath: key, order: 6, showOnMain: true });
        expect(has(created.imagePath)).toBe(true);
        expect(has(key)).toBe(true);
    });

    test('a failed commit removes the stored photo and the adopted video', async () => {
        const key = stored();
        const before = readdirSync(path.join(dir, 'carousels'));
        await expect(
            admin.createSlide({
                content,
                image: photo(),
                video: { videoPath: key, videoUrl: null },
                departmentId: 999_999,
                showOnMain: true,
            }),
        ).rejects.toThrow();
        expect(has(key)).toBe(false);
        expect(readdirSync(path.join(dir, 'carousels'))).toEqual(before);
    });
});

describe('duplicateSlide', () => {
    const layer = (src: string) => ({
        type: 'image' as const,
        id: 'l1',
        x: 10,
        y: 10,
        w: 20,
        h: 20,
        rotation: 0,
        opacity: 100,
        src,
        alt: 'Logo',
        radius: 'none' as const,
    });

    test('copies the photo, layer images (src rewritten) and video, and shifts later slides', async () => {
        const layerKey = stored(`carousels/layer-${++counter}.webp`);
        const videoKey = stored();
        const src = `/storage/${layerKey}`;
        const original = await db.carouselItem.create({
            data: {
                imagePath: stored(`carousels/${++counter}.webp`),
                videoPath: videoKey,
                order: 1,
                overlay: serializeOverlay([layer(src)]),
            },
        });
        const later = await db.carouselItem.create({
            data: { imagePath: stored(`carousels/${++counter}.webp`), order: 2 },
        });

        const copy = await admin.duplicateSlide(original);

        expect(copy.order).toBe(2);
        expect((await db.carouselItem.findUniqueOrThrow({ where: { id: later.id } })).order).toBe(3);
        expect(copy.imagePath).not.toBe(original.imagePath);
        expect(has(copy.imagePath)).toBe(true);
        expect(copy.videoPath).not.toBe(videoKey);
        expect(has(copy.videoPath as string)).toBe(true);
        const [copied] = admin.overlayImageSrcs(copy.overlay);
        expect(copied).not.toBe(src);
        expect(has(admin.ownedImageKey(copied) as string)).toBe(true);

        // Deleting the original leaves the copy whole.
        await admin.deleteSlide(original);
        expect(has(copy.imagePath) && has(copy.videoPath as string) && has(admin.ownedImageKey(copied) as string)).toBe(
            true,
        );
        expect(has(layerKey)).toBe(false);
    });

    test('a failed duplicate leaves no stray files', async () => {
        const original = await db.carouselItem.create({
            data: { imagePath: stored(`carousels/${++counter}.webp`), videoPath: stored(), order: 1 },
        });
        const files = () =>
            [...readdirSync(path.join(dir, 'carousels')), ...readdirSync(path.join(dir, 'videos'))].sort();
        const before = files();

        const spy = vi.spyOn(db.carouselItem, 'create').mockImplementationOnce(() => {
            throw new Error('boom');
        });
        await expect(admin.duplicateSlide(original)).rejects.toThrow('boom');
        spy.mockRestore();

        expect(files()).toEqual(before);
        expect(await db.carouselItem.count()).toBe(1);
    });
});

describe('updateSlide: the row owns its video file', () => {
    test('replacing a video removes the old file and keeps the new one', async () => {
        const oldKey = stored();
        const newKey = stored();
        const row = await slide({ videoPath: oldKey });
        const saved = await admin.updateSlide(row, { content, video: { videoPath: newKey, videoUrl: null } });
        expect(saved.videoPath).toBe(newKey);
        expect(has(oldKey)).toBe(false);
        expect(has(newKey)).toBe(true);
        expect(has(row.imagePath)).toBe(true);
    });

    test('removing the video, or switching to YouTube, removes the file', async () => {
        const first = stored();
        const row = await slide({ videoPath: first });
        const cleared = await admin.updateSlide(row, { content, video: none });
        expect(cleared).toMatchObject(none);
        expect(has(first)).toBe(false);

        const second = stored();
        const next = await slide({ videoPath: second });
        const youtube = await admin.updateSlide(next, {
            content,
            video: { videoPath: null, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        });
        expect(youtube).toMatchObject({ videoPath: null, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
        expect(has(second)).toBe(false);
    });

    test('an omitted or unchanged video keeps its file', async () => {
        const key = stored();
        const row = await slide({ videoPath: key });
        await admin.updateSlide(row, { content });
        expect(has(key)).toBe(true);
        await admin.updateSlide(row, { content, video: { videoPath: key, videoUrl: null } });
        expect(has(key)).toBe(true);
        expect((await db.carouselItem.findUniqueOrThrow({ where: { id: row.id } })).videoPath).toBe(key);
    });

    test('a failed commit keeps the old file and removes the newly adopted one', async () => {
        const oldKey = stored();
        const newKey = stored();
        const row = await slide({ videoPath: oldKey });
        await db.carouselItem.delete({ where: { id: row.id } });
        await expect(
            admin.updateSlide(row, { content, video: { videoPath: newKey, videoUrl: null } }),
        ).rejects.toThrow();
        expect(has(oldKey)).toBe(true);
        expect(has(newKey)).toBe(false);
    });

    test('replacing the photo removes the old photo and keeps the video', async () => {
        const key = stored();
        const row = await slide({ videoPath: key });
        const image = new File([new Uint8Array([1, 2, 3])], 'new.webp', { type: 'image/webp' });
        const saved = await admin.updateSlide(row, { content, image });
        expect(saved.imagePath).not.toBe(row.imagePath);
        expect(has(row.imagePath)).toBe(false);
        expect(has(key)).toBe(true);
    });
});

describe('deleteSlide', () => {
    test('removes the photo, the uploaded video and the row', async () => {
        const key = stored();
        const row = await slide({ videoPath: key });
        await admin.deleteSlide(row);
        expect(await db.carouselItem.count({ where: { id: row.id } })).toBe(0);
        expect(has(key)).toBe(false);
        expect(has(row.imagePath)).toBe(false);
    });

    test('a YouTube slide has no file to remove besides the photo', async () => {
        const row = await slide({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
        await admin.deleteSlide(row);
        expect(has(row.imagePath)).toBe(false);
    });
});
