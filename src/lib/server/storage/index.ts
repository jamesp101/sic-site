import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from '../../video-types';
import { storedType } from '../file-types';
import { createLocalDriver, type LocalDriver } from './local';
import type { ByteRange } from './range';
import type { S3Config, S3Driver } from './s3';
import type { StorageDriver, StoredObject } from './types';
import { originalCandidates, variantKeyOf } from './variants';

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

export const PREFIXES = [
    'posts',
    'posts/inline',
    'downloads',
    'carousels',
    'departments',
    'members',
    'videos',
] as const;
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
    // Videos never travel through actions or multipart: `s3` uploads straight to the bucket, `local`
    // streams the request body to disk (`/api/admin/uploads/video`).
    video: VIDEO_MAX_BYTES,
} as const;

/** Absolute base for direct object URLs (no trailing slash), or null to serve through /storage. */
export const directBaseUrl: string | null =
    driverName === 's3' && process.env.S3_PUBLIC_URL?.trim()
        ? process.env.S3_PUBLIC_URL.trim().replace(/\/+$/, '')
        : null;

/**
 * The S3 driver, loaded on its first call: the AWS SDK is the slowest module to start and only `STORAGE_DRIVER=s3`
 * needs it (a dynamic import, because the choice is made at run time).
 */
function createLazyS3Driver(config: S3Config): S3Driver {
    let loaded: Promise<S3Driver> | undefined;
    const load = () => (loaded ??= import('./s3').then(({ createS3Driver }) => createS3Driver(config)));
    return {
        name: 's3',
        put: async (key, body, contentType) => (await load()).put(key, body, contentType),
        delete: async (key) => (await load()).delete(key),
        get: async (key, range) => (await load()).get(key, range),
        head: async (key) => (await load()).head(key),
        async *list(prefix) {
            yield* (await load()).list(prefix);
        },
        presignPut: async (key, contentType, size, expiresIn) =>
            (await load()).presignPut(key, contentType, size, expiresIn),
    };
}

function createDriver(): StorageDriver {
    if (driverName === 'local') return createLocalDriver(process.env.UPLOAD_DIR ?? './storage/uploads');
    const prefix = cleanPrefix('S3_PREFIX');
    return createLazyS3Driver({
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

/**
 * URL of the `width` px variant of a stored image whose kind has one (`storage/variants.ts`), else null. Always the
 * app route: it serves the original when the variant is missing (not backfilled yet, or never made), which a
 * direct bucket URL could not.
 */
export function variantUrl(value: string | null | undefined, width: number): string | null {
    if (!value || isExternal(value) || (value.startsWith('/') && !value.startsWith('/storage/'))) return null;
    const variantKey = variantKeyOf(toKey(value), width);
    return variantKey ? `/storage/${variantKey}` : null;
}

/**
 * The app route URL of a stored key (`/storage/<key>`) even when `S3_PUBLIC_URL` is set. Use it for
 * URLs kept in content that must not depend on where files are hosted; the route redirects inline
 * requests to the bucket base, which answers `Range` itself.
 */
export function storageRouteUrl(value: string): string {
    return `/storage/${toKey(value)}`;
}

/** Inverse of `publicUrl`: the bare key of one of our own file URLs (`/storage/<key>` or the direct base), else null. */
export function keyFromPublicUrl(url: string): string | null {
    const prefixes = directBaseUrl ? [`${directBaseUrl}/`, '/storage/'] : ['/storage/'];
    const prefix = prefixes.find((candidate) => url.startsWith(candidate));
    if (!prefix) return null;
    const rest = url.slice(prefix.length);
    try {
        return toKey(rest) === rest ? rest : null;
    } catch {
        return null;
    }
}

/**
 * Inverse of `publicUrl` for uploaded videos: the bare key when `url` is one of our file URLs
 * directly under `videos/` with a video extension, else null.
 */
export function videoKeyFromUrl(url: string): string | null {
    const key = keyFromPublicUrl(url);
    if (!key) return null;
    const [directory, name, ...deeper] = key.split('/');
    if (directory !== 'videos' || !name || deeper.length > 0) return null;
    return Object.hasOwn(VIDEO_TYPES, path.extname(name)) ? key : null;
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
    await driver.put(key, file, contentType);
    return key;
}

/** Deletes a stored object; missing objects and external URLs are ignored. */
export async function remove(value: string | null | undefined): Promise<void> {
    if (!value || isExternal(value)) return;
    await driver.delete(toKey(value));
}

/**
 * The key to serve for a request: `key` itself, except for a variant of an image kind that has variants
 * (`variants.ts`) that is missing, which is served by its original. Any other key, and a variant whose original is
 * gone too (or invalid), returns `key` untouched, so the route answers 404 after at most one `HEAD` per
 * candidate original.
 */
export async function servedKey(key: string): Promise<string> {
    const candidates = originalCandidates(key);
    if (candidates.length === 0) return key;
    try {
        if (await driver.head(toKey(key))) return key;
        for (const candidate of candidates) if (await driver.head(candidate)) return candidate;
    } catch {
        // invalid key: let the route answer 404
    }
    return key;
}

/** Streams a stored object (or only `range` of it), or null when missing or the key is invalid. Throws `RangeNotSatisfiableError` for an empty range. */
export async function read(value: string, range?: ByteRange): Promise<StoredObject | null> {
    let key: string;
    try {
        key = toKey(value);
    } catch {
        return null;
    }
    return driver.get(key, range);
}

function directDriver(): S3Driver {
    if (driverName !== 's3') throw new Error('Direct uploads require STORAGE_DRIVER=s3');
    return driver as S3Driver;
}

/** Size of a stored object (e.g. one the browser uploaded straight to the bucket), or null when missing. */
export async function headUpload(value: string): Promise<{ size: number } | null> {
    return driver.head(toKey(value));
}

/**
 * Streams a request body to `key` on disk, never holding it in memory, and returns the bytes written.
 * Throws `UploadTooLargeError` (nothing is left behind) as soon as more than `maxBytes` arrive.
 * Only valid for `local`; `s3` uploads go straight to the bucket (`presignUpload`).
 */
export async function receiveUpload(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
    if (driverName !== 'local') throw new Error('Streamed uploads require STORAGE_DRIVER=local');
    return (driver as LocalDriver).putStream(toKey(key), body, maxBytes);
}

/** Presigned PUT URL (10 minutes) for a browser upload of exactly `size` bytes of `contentType`. Only valid for `s3`. */
export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
    return directDriver().presignPut(toKey(key), contentType, size, 10 * 60);
}
