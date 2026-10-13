import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const blob = vi.hoisted(() => {
    class BlobNotFoundError extends Error {}
    return { BlobNotFoundError, put: vi.fn(), del: vi.fn(), get: vi.fn(), head: vi.fn() };
});
vi.mock('@vercel/blob', () => blob);

const ENV = ['STORAGE_DRIVER', 'BLOB_READ_WRITE_TOKEN', 'BLOB_PUBLIC_BASE_URL', 'BLOB_PREFIX'];
const saved = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));

/** Storage reads its configuration at module load, so each case imports a fresh copy (intentional dynamic import). */
async function loadStorage(env: Record<string, string>) {
    for (const name of ENV) delete process.env[name];
    Object.assign(process.env, { STORAGE_DRIVER: 'vercel-blob', ...env });
    vi.resetModules();
    return import('./index');
}

const BASE = {
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test_token',
    BLOB_PUBLIC_BASE_URL: 'https://abc.public.blob.vercel-storage.com/',
};

afterEach(() => {
    vi.clearAllMocks();
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe('vercel-blob driver selection', () => {
    it('fails fast when the token or public base URL is missing', async () => {
        await expect(loadStorage({ BLOB_PUBLIC_BASE_URL: BASE.BLOB_PUBLIC_BASE_URL })).rejects.toThrow(
            'BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel-blob',
        );
        await expect(loadStorage({ BLOB_READ_WRITE_TOKEN: BASE.BLOB_READ_WRITE_TOKEN })).rejects.toThrow(
            'BLOB_PUBLIC_BASE_URL is required when STORAGE_DRIVER=vercel-blob',
        );
        await expect(loadStorage({ ...BASE, BLOB_PUBLIC_BASE_URL: 'http://insecure.example' })).rejects.toThrow(
            'must be an https:// URL',
        );
    });

    it('returns direct blob URLs, honouring BLOB_PREFIX; downloads stay on the app route', async () => {
        const plain = await loadStorage(BASE);
        expect(plain.driverName).toBe('vercel-blob');
        expect(plain.directUploads).toBe(true);
        expect(plain.directBaseUrl).toBe('https://abc.public.blob.vercel-storage.com');
        expect(plain.publicUrl('posts/a.jpg')).toBe('https://abc.public.blob.vercel-storage.com/posts/a.jpg');
        expect(plain.publicUrl('/storage/posts/a.jpg')).toBe('https://abc.public.blob.vercel-storage.com/posts/a.jpg');
        expect(plain.downloadUrl('downloads/b.pdf', 'b.pdf')).toBe('/storage/downloads/b.pdf?download=b.pdf');

        const prefixed = await loadStorage({ ...BASE, BLOB_PREFIX: '/sic/' });
        expect(prefixed.publicUrl('posts/a.jpg')).toBe('https://abc.public.blob.vercel-storage.com/sic/posts/a.jpg');
        expect(prefixed.uploadPathname('downloads/x.pdf')).toBe('sic/downloads/x.pdf');
    });

    it('keeps multipart images under the platform request limit', async () => {
        const storage = await loadStorage(BASE);
        expect(storage.LIMITS.image).toBe(4 * storage.MB);
    });
});

describe('vercel-blob driver operations', () => {
    it('puts public blobs without random suffix under the prefix', async () => {
        blob.put.mockResolvedValue({});
        const storage = await loadStorage({ ...BASE, BLOB_PREFIX: 'sic' });
        const key = await storage.put('posts', new File(['hello'], 'Photo.PNG', { type: 'image/png' }));
        expect(key).toMatch(/^posts\/[0-9a-f]{32}\.png$/);
        const [pathname, body, options] = blob.put.mock.calls[0]!;
        expect(pathname).toBe(`sic/${key}`);
        expect(Buffer.from(body).toString()).toBe('hello');
        expect(options).toMatchObject({
            access: 'public',
            addRandomSuffix: false,
            contentType: 'image/png',
            token: BASE.BLOB_READ_WRITE_TOKEN,
        });
    });

    it('deletes by pathname and ignores external URLs', async () => {
        blob.del.mockResolvedValue(undefined);
        const storage = await loadStorage(BASE);
        await storage.remove('/storage/posts/a.jpg');
        expect(blob.del).toHaveBeenCalledWith('posts/a.jpg', { token: BASE.BLOB_READ_WRITE_TOKEN });
        await storage.remove('https://example.org/x.png');
        expect(blob.del).toHaveBeenCalledTimes(1);
    });

    it('reads streams and maps missing blobs to null', async () => {
        const stream = new Response('data').body!;
        blob.get.mockResolvedValueOnce({
            statusCode: 200,
            stream,
            blob: { size: 4, uploadedAt: new Date(0), contentType: 'text/plain' },
        });
        const storage = await loadStorage(BASE);
        const file = await storage.read('posts/a.txt');
        expect(file).toMatchObject({ size: 4, contentType: 'text/plain' });
        expect(blob.get).toHaveBeenCalledWith('posts/a.txt', { access: 'public', token: BASE.BLOB_READ_WRITE_TOKEN });

        blob.get.mockResolvedValueOnce(null);
        expect(await storage.read('posts/missing.txt')).toBeNull();
        blob.get.mockRejectedValueOnce(new blob.BlobNotFoundError());
        expect(await storage.read('posts/missing2.txt')).toBeNull();
        blob.get.mockRejectedValueOnce(new Error('boom'));
        await expect(storage.read('posts/err.txt')).rejects.toThrow('boom');
        expect(await storage.read('../x')).toBeNull();
    });

    it('checks direct uploads with head()', async () => {
        const storage = await loadStorage(BASE);
        blob.head.mockResolvedValueOnce({ size: 1234 });
        expect(await storage.headUpload('downloads/abc.pdf')).toEqual({ size: 1234 });
        expect(blob.head).toHaveBeenCalledWith('downloads/abc.pdf', { token: BASE.BLOB_READ_WRITE_TOKEN });
        blob.head.mockRejectedValueOnce(new blob.BlobNotFoundError());
        expect(await storage.headUpload('downloads/gone.pdf')).toBeNull();
    });
});
