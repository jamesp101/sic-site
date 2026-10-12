import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

const STORAGE_ENV = [
    'STORAGE_DRIVER',
    'UPLOAD_DIR',
    'S3_BUCKET',
    'S3_REGION',
    'S3_ENDPOINT',
    'S3_PUBLIC_URL',
    'S3_PREFIX',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
];
const saved = Object.fromEntries(STORAGE_ENV.map((name) => [name, process.env[name]]));

let dir: string;

/** Storage reads its configuration at module load, so each case imports a fresh copy (intentional dynamic import). */
async function loadStorage(env: Record<string, string>) {
    for (const name of STORAGE_ENV) delete process.env[name];
    Object.assign(process.env, env);
    vi.resetModules();
    return import('./storage');
}

beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'sic-storage-'));
});

afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('local driver (default)', () => {
    it('normalises legacy Laravel /storage paths to bare keys and app URLs', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: dir });
        expect(storage.driverName).toBe('local');
        expect(storage.toKey('/storage/posts/a.jpg')).toBe('posts/a.jpg');
        expect(storage.publicUrl('/storage/posts/a.jpg')).toBe('/storage/posts/a.jpg');
        expect(storage.publicUrl('downloads/b.pdf')).toBe('/storage/downloads/b.pdf');
        expect(storage.publicUrl('/sic-seal.png')).toBe('/sic-seal.png');
        expect(storage.publicUrl('https://example.org/x.png')).toBe('https://example.org/x.png');
        expect(storage.publicUrl(null)).toBeNull();
        expect(storage.downloadUrl('downloads/b.pdf', 'Form 1.pdf')).toBe(
            '/storage/downloads/b.pdf?download=Form%201.pdf',
        );
    });

    it('rejects path traversal for every operation', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: dir });
        expect(() => storage.toKey('../etc/passwd')).toThrow('Invalid storage key');
        expect(() => storage.toKey('posts/../../x')).toThrow('Invalid storage key');
        await expect(storage.remove('../outside.txt')).rejects.toThrow('Invalid storage key');
        expect(await storage.read('posts/../../etc/passwd')).toBeNull();
    });

    it('round-trips put/read/remove under the prefix', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: dir });
        const key = await storage.put('posts/inline', new File(['hello'], 'Photo.JPG', { type: 'image/jpeg' }));
        expect(key).toMatch(/^posts\/inline\/[0-9a-f]{32}\.jpg$/);
        const file = await storage.read(key);
        expect(file?.size).toBe(5);
        expect(await new Response(file!.body).text()).toBe('hello');
        await storage.remove(`/storage/${key}`);
        expect(await storage.read(key)).toBeNull();
    });

    it('ignores removal of missing objects and external URLs', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: dir });
        await expect(storage.remove('posts/missing.png')).resolves.toBeUndefined();
        await expect(storage.remove('https://example.org/x.png')).resolves.toBeUndefined();
    });
});

describe('driver selection', () => {
    it('rejects unknown drivers', async () => {
        await expect(loadStorage({ STORAGE_DRIVER: 'ftp' })).rejects.toThrow('Unsupported STORAGE_DRIVER "ftp"');
    });

    it('requires a bucket for s3', async () => {
        await expect(loadStorage({ STORAGE_DRIVER: 's3' })).rejects.toThrow('S3_BUCKET is required');
    });

    it('serves s3 objects through /storage unless S3_PUBLIC_URL is set', async () => {
        const proxied = await loadStorage({ STORAGE_DRIVER: 'S3', S3_BUCKET: 'sic' });
        expect(proxied.driverName).toBe('s3');
        expect(proxied.directBaseUrl).toBeNull();
        expect(proxied.publicUrl('posts/a.jpg')).toBe('/storage/posts/a.jpg');

        const direct = await loadStorage({
            STORAGE_DRIVER: 's3',
            S3_BUCKET: 'sic',
            S3_PUBLIC_URL: 'https://cdn.example.org/sic/',
        });
        expect(direct.publicUrl('/storage/posts/a.jpg')).toBe('https://cdn.example.org/sic/posts/a.jpg');
        // Downloads stay on the app route so the attachment filename is applied.
        expect(direct.downloadUrl('downloads/b.pdf', 'b.pdf')).toBe('/storage/downloads/b.pdf?download=b.pdf');
    });

    it('ignores S3_PUBLIC_URL for the local driver', async () => {
        const storage = await loadStorage({ UPLOAD_DIR: dir, S3_PUBLIC_URL: 'https://cdn.example.org' });
        expect(storage.publicUrl('posts/a.jpg')).toBe('/storage/posts/a.jpg');
    });
});
