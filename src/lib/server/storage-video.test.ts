import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const STORAGE_ENV = ['STORAGE_DRIVER', 'UPLOAD_DIR', 'S3_BUCKET', 'S3_PUBLIC_URL', 'S3_PREFIX'];
const saved = Object.fromEntries(STORAGE_ENV.map((name) => [name, process.env[name]]));

/** Storage reads its configuration at module load, so each case imports a fresh copy (intentional dynamic import). */
async function loadStorage(env: Record<string, string>) {
    for (const name of STORAGE_ENV) delete process.env[name];
    Object.assign(process.env, env);
    vi.resetModules();
    return import('./storage');
}

afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe('videoKeyFromUrl', () => {
    it('returns the bare key of one of our video URLs and nothing else', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: '/tmp/sic-video-url' });
        expect(storage.videoKeyFromUrl('/storage/videos/a.mp4')).toBe('videos/a.mp4');
        expect(storage.videoKeyFromUrl('/storage/videos/a.webm')).toBe('videos/a.webm');
        expect(storage.videoKeyFromUrl('/storage/videos/a.pdf')).toBeNull();
        expect(storage.videoKeyFromUrl('/storage/videos/a')).toBeNull();
        expect(storage.videoKeyFromUrl('/storage/posts/a.mp4')).toBeNull();
        expect(storage.videoKeyFromUrl('/storage/videos/nested/a.mp4')).toBeNull();
        expect(storage.videoKeyFromUrl('/storage/videos/../a.mp4')).toBeNull();
        expect(storage.videoKeyFromUrl('/storage/videos/')).toBeNull();
        expect(storage.videoKeyFromUrl('https://example.org/storage/videos/a.mp4')).toBeNull();
        expect(storage.videoKeyFromUrl('https://youtu.be/abc')).toBeNull();
        expect(storage.videoKeyFromUrl('videos/a.mp4')).toBeNull();
    });

    it('also reads the bucket URL when S3_PUBLIC_URL is set', async () => {
        const storage = await loadStorage({
            STORAGE_DRIVER: 's3',
            S3_BUCKET: 'sic',
            S3_PUBLIC_URL: 'https://cdn.example.org/sic/',
        });
        expect(storage.videoKeyFromUrl('https://cdn.example.org/sic/videos/a.mp4')).toBe('videos/a.mp4');
        expect(storage.videoKeyFromUrl('/storage/videos/a.mp4')).toBe('videos/a.mp4');
        expect(storage.videoKeyFromUrl('https://evil.example.org/sic/videos/a.mp4')).toBeNull();
    });

    it('storageRouteUrl is the app route URL even with S3_PUBLIC_URL, and videoKeyFromUrl reads both forms', async () => {
        const storage = await loadStorage({
            STORAGE_DRIVER: 's3',
            S3_BUCKET: 'sic',
            S3_PUBLIC_URL: 'https://cdn.example.org/sic',
        });
        const key = 'videos/0123456789abcdef0123456789abcdef.mp4';
        expect(storage.publicUrl(key)).toBe(`https://cdn.example.org/sic/${key}`);
        expect(storage.storageRouteUrl(key)).toBe(`/storage/${key}`);
        expect(storage.videoKeyFromUrl(storage.storageRouteUrl(key))).toBe(key);
        expect(storage.videoKeyFromUrl(storage.publicUrl(key)!)).toBe(key);
        expect(() => storage.storageRouteUrl('../x')).toThrow('Invalid storage key');
    });

    it('is the inverse of publicUrl for a stored video key', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: '/tmp/sic-video-url' });
        const url = storage.publicUrl('videos/0123456789abcdef0123456789abcdef.mp4')!;
        expect(storage.videoKeyFromUrl(url)).toBe('videos/0123456789abcdef0123456789abcdef.mp4');
    });
});

describe('video limits', () => {
    it('allows 100 MB videos and a videos/ prefix', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: '/tmp/sic-video-url' });
        expect(storage.LIMITS.video).toBe(100 * storage.MB);
        expect(storage.PREFIXES).toContain('videos');
    });

    it('streams uploads to disk only on the local driver', async () => {
        const s3 = await loadStorage({ STORAGE_DRIVER: 's3', S3_BUCKET: 'sic' });
        await expect(s3.receiveUpload('videos/a.mp4', new Blob(['x']).stream(), 10)).rejects.toThrow(
            'Streamed uploads require STORAGE_DRIVER=local',
        );
    });
});
