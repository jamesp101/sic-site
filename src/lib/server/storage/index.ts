import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createLocalDriver } from './local';
import { createS3Driver } from './s3';
import type { StorageDriver, StoredObject } from './types';

export type { StorageDriver, StoredObject };

/**
 * Uploaded-file storage. STORAGE_DRIVER picks the backend:
 * - `local` (default): files under UPLOAD_DIR on the server's disk.
 * - `s3`: an S3-compatible bucket (S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID,
 *   S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE, S3_PREFIX).
 *
 * The database stores bare keys (`posts/abc.jpg`). URLs default to `/storage/<key>`,
 * served by src/pages/storage/[...path].ts for both drivers, which keeps legacy Laravel
 * `/storage/...` links working. With S3_PUBLIC_URL set (bucket website, CDN), `publicUrl`
 * points straight at the bucket and the route redirects there instead.
 */
export type DriverName = 'local' | 's3';

export const PREFIXES = ['posts', 'posts/inline', 'downloads', 'carousels', 'departments', 'members'] as const;
export type StoragePrefix = (typeof PREFIXES)[number];

export const MB = 1024 * 1024;
export const LIMITS = { image: 5 * MB, memberImage: 2 * MB, download: 20 * MB } as const;

function readDriverName(value: string | undefined): DriverName {
    const name = (value ?? 'local').trim().toLowerCase();
    if (name === 'local' || name === 's3') return name;
    throw new Error(`Unsupported STORAGE_DRIVER "${value}" (expected "local" or "s3")`);
}

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required when STORAGE_DRIVER=s3`);
    return value;
}

export const driverName: DriverName = readDriverName(process.env.STORAGE_DRIVER);

/** Absolute base for direct object URLs (no trailing slash), or null to serve through /storage. */
export const directBaseUrl: string | null =
    driverName === 's3' && process.env.S3_PUBLIC_URL?.trim()
        ? process.env.S3_PUBLIC_URL.trim().replace(/\/+$/, '')
        : null;

function createDriver(): StorageDriver {
    if (driverName === 'local') return createLocalDriver(process.env.UPLOAD_DIR ?? './storage/uploads');
    const prefix = process.env.S3_PREFIX?.trim().replace(/^\/+|\/+$/g, '') ?? '';
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
