import { afterAll, beforeAll, describe, expect, test, vi } from 'vite-plus/test';
import type { PrismaClient } from '../../generated/prisma/client';
import type * as Slides from './slides';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

process.env.STORAGE_DRIVER = 'local';

let slides: typeof Slides;
let db: PrismaClient;

// The storage driver reads its env when its module loads, so the modules load after the env is set.
beforeAll(async () => {
    slides = await import('./slides');
    db = (await import('./db')).db as unknown as PrismaClient;
});
afterAll(async () => (await import('./test-db')).closeTestDb());

const none = { videoPath: null, videoUrl: null };

describe('slide video views', () => {
    test('files and YouTube links', () => {
        expect(slides.slideVideoView({ videoPath: 'videos/a.webm', videoUrl: null })).toEqual({
            kind: 'file',
            src: '/storage/videos/a.webm',
            mime: 'video/webm',
        });
        expect(slides.slideVideoView({ videoPath: 'videos/a.mp4', videoUrl: null })).toMatchObject({
            mime: 'video/mp4',
        });
        expect(
            slides.slideVideoView({ videoPath: null, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
        ).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ' });
        expect(slides.slideVideoView({ videoPath: null, videoUrl: 'https://vimeo.com/123456789' })).toBeNull();
        expect(slides.slideVideoView(none)).toBeNull();
    });

    test('the designer shows the same video as the public Carousel', async () => {
        const file = await db.carouselItem.create({
            data: { imagePath: 'carousels/a.webp', videoPath: 'videos/a.mp4' },
        });
        const youtube = await db.carouselItem.create({
            data: { imagePath: 'carousels/b.webp', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        });
        const plain = await db.carouselItem.create({ data: { imagePath: 'carousels/c.webp' } });

        const designer = [file, youtube, plain].map(slides.toDesignerSlide);
        expect(designer.map((s) => [s.video, s.videoKind])).toEqual([
            ['/storage/videos/a.mp4', 'file'],
            ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
            ['', null],
        ]);

        const pub = await slides.findSlides({ id: { in: [file.id, youtube.id, plain.id] } });
        expect(pub.map((s) => s.video?.kind ?? null)).toEqual(designer.map((s) => s.videoKind));
    });
});

describe('slide image URLs', () => {
    test('stored keys, site paths and external URLs map the same in the designer and the public Carousel', async () => {
        const keys = ['carousels/a.webp', '/images/hero.jpg', 'https://cdn.example.org/a.webp'];
        const rows = [];
        for (const imagePath of keys) rows.push(await db.carouselItem.create({ data: { imagePath } }));

        const expected = ['/storage/carousels/a.webp', '/images/hero.jpg', 'https://cdn.example.org/a.webp'];
        expect(rows.map((row) => slides.toDesignerSlide(row).imageUrl)).toEqual(expected);
        const pub = await slides.findSlides({ id: { in: rows.map((row) => row.id) } });
        expect(pub.map((s) => s.imageUrl)).toEqual(expected);
    });
});
