import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { storedType } from '../file-types';
import { createLocalDriver } from './local';
import { createS3Driver, type S3Driver } from './s3';
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

function readDriverName(value: string | undefined): DriverName {
    const name = (value ?? 'local').trim().toLowerCase();
    if (name === 'local' || name === 's3') return name;
    throw new Error(`Unsupported STORAGE_DRIVER "${value}" (expected "local" or "s3")`);
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
 * True when the browser uploads downloads straight to the bucket through a presigned URL (Vercel
 * functions reject request bodies over ~4.5 MB), so the multipart upload path is only for small files.
 */
export const directUploads: boolean = driverName === 's3';

const MULTIPART_BUDGET = 4 * MB;
export const LIMITS = {
    // Multipart bodies must stay under Vercel's ~4.5 MB request limit; larger downloads use direct uploads.
    image: directUploads ? MULTIPART_BUDGET : 5 * MB,
    memberImage: 2 * MB,
    download: 20 * MB,
} as const;

/** Absolute base for direct object URLs (no trailing slash), or null to serve through /storage. */
export const directBaseUrl: string | null =
    driverName === 's3' && process.env.S3_PUBLIC_URL?.trim()
        ? process.env.S3_PUBLIC_URL.trim().replace(/\/+$/, '')
        : null;

function createDriver(): StorageDriver {
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

/** Stores a file under `prefix/` with a random name and returns its key; type and extension come from `storedType`. */
export async function put(prefix: StoragePrefix, file: File): Promise<string> {
    const { ext, contentType } = storedType(file.name, file.type);
    const key = `${prefix}/${randomBytes(16).toString('hex')}${ext}`;
    await driver.put(key, new Uint8Array(await file.arrayBuffer()), contentType);
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

function directDriver(): S3Driver {
    if (driverName !== 's3') throw new Error('Direct uploads require STORAGE_DRIVER=s3');
    return driver as S3Driver;
}

/** Size of an object the browser uploaded straight to the bucket, or null when missing. Only valid for `s3`. */
export async function headUpload(value: string): Promise<{ size: number } | null> {
    return directDriver().head(toKey(value));
}

/** Presigned PUT URL (10 minutes) for a browser upload of exactly `size` bytes of `contentType`. Only valid for `s3`. */
export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
    return directDriver().presignPut(toKey(key), contentType, size, 10 * 60);
}
