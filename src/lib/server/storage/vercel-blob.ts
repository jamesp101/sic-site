import { BlobNotFoundError, del, get, head, put } from '@vercel/blob';
import type { StorageDriver } from './types';

export interface VercelBlobConfig {
    /** Read-write token of the Blob store (`BLOB_READ_WRITE_TOKEN`). */
    token: string;
    /** Optional pathname prefix inside the store, with trailing slash, e.g. `sic/`. */
    prefix: string;
}

export interface VercelBlobDriver extends StorageDriver {
    /** Blob pathname for a key (prefix applied); browser-direct uploads must target it. */
    pathname(key: string): string;
    /** Size of an existing object, or null when it does not exist. */
    head(key: string): Promise<{ size: number } | null>;
}

const isNotFound = (error: unknown): boolean => error instanceof BlobNotFoundError;

/** Public objects in a Vercel Blob store. Keys stay bare; `prefix` is prepended to the blob pathname. */
export function createVercelBlobDriver(config: VercelBlobConfig): VercelBlobDriver {
    const { token } = config;
    const pathname = (key: string) => `${config.prefix}${key}`;

    return {
        name: 'vercel-blob',
        pathname,
        async put(key, body, contentType) {
            await put(pathname(key), Buffer.from(body.buffer, body.byteOffset, body.byteLength), {
                access: 'public',
                addRandomSuffix: false,
                contentType,
                cacheControlMaxAge: 31536000,
                token,
            });
        },
        async delete(key) {
            await del(pathname(key), { token });
        },
        async get(key) {
            const result = await get(pathname(key), { access: 'public', token }).catch((error: unknown) => {
                if (isNotFound(error)) return null;
                throw error;
            });
            if (!result || result.statusCode !== 200) return null;
            return {
                body: result.stream,
                size: result.blob.size,
                mtime: result.blob.uploadedAt,
                contentType: result.blob.contentType,
            };
        },
        async head(key) {
            try {
                const { size } = await head(pathname(key), { token });
                return { size };
            } catch (error) {
                if (isNotFound(error)) return null;
                throw error;
            }
        },
    };
}
