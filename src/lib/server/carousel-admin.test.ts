import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { PrismaClient } from '../../generated/prisma/client';
import type * as CarouselAdmin from './carousel-admin';

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

describe('slide video views', () => {
    test('files and YouTube links reach the public and the designer view', () => {
        expect(admin.slideVideoView({ videoPath: 'videos/a.webm', videoUrl: null })).toEqual({
            kind: 'file',
            src: '/storage/videos/a.webm',
            mime: 'video/webm',
        });
        expect(admin.slideVideoView({ videoPath: 'videos/a.mp4', videoUrl: null })).toMatchObject({
            mime: 'video/mp4',
        });
        expect(
            admin.slideVideoView({ videoPath: null, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
        ).toEqual({
            kind: 'youtube',
            id: 'dQw4w9WgXcQ',
        });
        expect(admin.slideVideoView({ videoPath: null, videoUrl: 'https://vimeo.com/123456789' })).toBeNull();
        expect(admin.slideVideoView(none)).toBeNull();
    });
});

describe('videoClaimError', () => {
    test('a missing file cannot be adopted', async () => {
        expect(await admin.videoClaimError('videos/ffffffffffffffffffffffffffffffff.mp4')).toMatch(/not found/);
    });

    test('a video another slide or some content uses cannot be adopted; the owner may keep it', async () => {
        const key = stored();
        const owner = await slide({ videoPath: key });
        expect(await admin.videoClaimError(key)).toMatch(/already used/);
        expect(await admin.videoClaimError(key, owner.id + 1)).toMatch(/already used/);
        expect(await admin.videoClaimError(key, owner.id)).toBeNull();

        const free = stored();
        expect(await admin.videoClaimError(free)).toBeNull();
        await db.setting.create({ data: { key: 'welcome_hero_content', value: `{"url":"/storage/${free}"}` } });
        expect(await admin.videoClaimError(free)).toMatch(/already used/);
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
