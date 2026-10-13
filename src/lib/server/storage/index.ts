import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createLocalDriver } from './local';
import { createS3Driver } from './s3';
import type { StorageDriver, StoredObject } from './types';
import { createVercelBlobDriver, type VercelBlobDriver } from './vercel-blob';

export type { StorageDriver, StoredObject };

/**
 * Uploaded-file storage. STORAGE_DRIVER picks the backend:
 * - `local` (default): files under UPLOAD_DIR on the server's disk.
 * - `s3`: an S3-compatible bucket (S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID,
 *   S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE, S3_PREFIX).
 * - `vercel-blob`: a public Vercel Blob store (BLOB_READ_WRITE_TOKEN, BLOB_PUBLIC_BASE_URL, BLOB_PREFIX).
 *
 * The database stores bare keys (`posts/abc.jpg`). URLs default to `/storage/<key>`,
 * served by src/pages/storage/[...path].ts for both drivers, which keeps legacy Laravel
 * `/storage/...` links working. With S3_PUBLIC_URL set (bucket website, CDN), `publicUrl`
 * points straight at the bucket and the route redirects there instead. `vercel-blob` always
 * has a public base URL, so inline URLs are direct blob URLs.
 */
export type DriverName = 'local' | 's3' | 'vercel-blob';

export const PREFIXES = ['posts', 'posts/inline', 'downloads', 'carousels', 'departments', 'members'] as const;
export type StoragePrefix = (typeof PREFIXES)[number];

export const MB = 1024 * 1024;

function readDriverName(value: string | undefined): DriverName {
    const name = (value ?? 'local').trim().toLowerCase();
    if (name === 'local' || name === 's3' || name === 'vercel-blob') return name;
    throw new Error(`Unsupported STORAGE_DRIVER "${value}" (expected "local", "s3" or "vercel-blob")`);
}

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required when STORAGE_DRIVER=${driverName}`);
    return value;
}

function cleanPrefix(name: string): string {
    return process.env[name]?.trim().replace(/^\/+|\/+$/g, '') ?? '';
}

export const driverName: DriverName = readDriverName(process.env.STORAGE_DRIVER);

/**
 * True when the browser uploads large files straight to the store (Vercel functions reject request
 * bodies over ~4.5 MB), so the multipart upload path is only for small files.
 */
export const directUploads: boolean = driverName === 'vercel-blob';

const MULTIPART_BUDGET = 4 * MB;
export const LIMITS = {
    // Multipart bodies must stay under Vercel's ~4.5 MB request limit; larger downloads use direct uploads.
    image: directUploads ? MULTIPART_BUDGET : 5 * MB,
    memberImage: 2 * MB,
    download: 20 * MB,
} as const;

/** Absolute base for direct object URLs (no trailing slash), or null to serve through /storage. */
export const directBaseUrl: string | null = (() => {
    if (driverName === 's3' && process.env.S3_PUBLIC_URL?.trim()) {
        return process.env.S3_PUBLIC_URL.trim().replace(/\/+$/, '');
    }
    if (driverName === 'vercel-blob') {
        const base = required('BLOB_PUBLIC_BASE_URL').replace(/\/+$/, '');
        if (!base.startsWith('https://')) throw new Error('BLOB_PUBLIC_BASE_URL must be an https:// URL');
        const prefix = cleanPrefix('BLOB_PREFIX');
        return prefix ? `${base}/${prefix}` : base;
    }
    return null;
})();

function createDriver(): StorageDriver {
    if (driverName === 'vercel-blob') {
        const prefix = cleanPrefix('BLOB_PREFIX');
        return createVercelBlobDriver({ token: required('BLOB_READ_WRITE_TOKEN'), prefix: prefix ? `${prefix}/` : '' });
    }
    if (driverName === 'local') return createLocalDriver(process.env.UPLOAD_DIR ?? './storage/uploads');
    const prefix = cleanPrefix('S3_PREFIX');
    return createS3Driver({
        bucket: required('S3_BUCKET'),
        region: process.env.S3_REGION?.trim() || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
        accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || undefined,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined,
        forcePathStyle: /^(1|true|yes)$/i.test(process.env.S3_FORCE_PATH_STYLE ?? ''),
        prefix: prefix ? `${prefix}/` : '',
    });
}

export const driver: StorageDriver = createDriver();

/** Accepts a bare key, `/storage/<key>` or `storage/<key>` and returns a validated bare key. */
export function toKey(value: string): string {
    const key = value.replace(/^\/?storage\//, '').replace(/^\/+/, '');
    const normalized = path.posix.normalize(key);
    if (!key || normalized !== key || normalized.startsWith('..') || key.includes('\\') || key.includes('\0')) {
        throw new Error('Invalid storage key');
    }
    return key;
}

function isExternal(value: string): boolean {
    return /^https?:\/\//.test(value);
}

/** Public URL for a stored key. Absolute http(s) URLs and non-storage site paths pass through. */
export function publicUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    if (isExternal(value)) return value;
    if (value.startsWith('/') && !value.startsWith('/storage/')) return value;
    const key = toKey(value);
    return directBaseUrl ? `${directBaseUrl}/${key}` : `/storage/${key}`;
}

/** URL that downloads the object as an attachment named `fileName` (always via the app route). */
export function downloadUrl(value: string, fileName: string): string {
    if (isExternal(value)) return value;
    return `/storage/${toKey(value)}?download=${encodeURIComponent(fileName)}`;
}

function extensionOf(name: string): string {
    const ext = path
        .extname(name)
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '');
    return ext.length > 1 && ext.length <= 10 ? ext : '';
}

/** Stores a file under `prefix/` with a random name and returns its key. */
export async function put(prefix: StoragePrefix, file: File): Promise<string> {
    const key = `${prefix}/${randomBytes(16).toString('hex')}${extensionOf(file.name)}`;
    await driver.put(key, new Uint8Array(await file.arrayBuffer()), file.type || 'application/octet-stream');
    return key;
}

/** Deletes a stored object; missing objects and external URLs are ignored. */
export async function remove(value: string | null | undefined): Promise<void> {
    if (!value || isExternal(value)) return;
    await driver.delete(toKey(value));
}

/** Streams a stored object, or null when missing or the key is invalid. */
export async function read(value: string): Promise<StoredObject | null> {
    let key: string;
    try {
        key = toKey(value);
    } catch {
        return null;
    }
    return driver.get(key);
}

/** Size of an object uploaded straight to Vercel Blob, or null when missing. Only valid for `vercel-blob`. */
export async function headUpload(value: string): Promise<{ size: number } | null> {
    if (driverName !== 'vercel-blob') throw new Error('Direct uploads require STORAGE_DRIVER=vercel-blob');
    return (driver as VercelBlobDriver).head(toKey(value));
}

/** Blob pathname (prefix applied) a browser must upload to for `key`. Only valid for `vercel-blob`. */
export function uploadPathname(key: string): string {
    if (driverName !== 'vercel-blob') throw new Error('Direct uploads require STORAGE_DRIVER=vercel-blob');
    return (driver as VercelBlobDriver).pathname(key);
}
