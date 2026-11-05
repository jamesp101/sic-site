import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RangeNotSatisfiableError } from './errors';
import { rangeHeaderValue } from './range';
import type { StorageDriver } from './types';

export interface S3Config {
    bucket: string;
    region: string;
    /** Custom endpoint for S3-compatible services (Cloudflare R2, Garage, SeaweedFS, …). */
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
    /** Optional key prefix inside the bucket, e.g. `sic/`. */
    prefix: string;
}

export interface S3Driver extends StorageDriver {
    /**
     * Presigned PUT URL for a browser upload of exactly `size` bytes of `contentType` to `key`.
     * Both are signed, so the browser must send them unchanged.
     */
    presignPut(key: string, contentType: string, size: number, expiresIn: number): Promise<string>;
}

const isMissing = (error: unknown): boolean =>
    error instanceof NoSuchKey ||
    error instanceof NotFound ||
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404);

/** Objects in an S3-compatible bucket. Credentials fall back to the AWS default chain when not set. */
export function createS3Driver(config: S3Config): S3Driver {
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        // Default CRC checksums would be baked into presigned URLs for an empty body and break
        // browser uploads; many S3-compatible services also reject them.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        credentials:
            config.accessKeyId && config.secretAccessKey
                ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
                : undefined,
    });
    const Bucket = config.bucket;
    const objectKey = (key: string) => `${config.prefix}${key}`;

    return {
        name: 's3',
        async put(key, body, contentType) {
            // Bytes, not a stream: the Node HTTP handler needs a known length, and multipart bodies on
            // `s3` stay under ~4 MB (larger Downloads go straight to the bucket).
            const bytes = new Uint8Array(await body.arrayBuffer());
            await client.send(
                new PutObjectCommand({ Bucket, Key: objectKey(key), Body: bytes, ContentType: contentType }),
            );
        },
        async delete(key) {
            // S3 DeleteObject succeeds for missing keys, matching the local driver.
            await client.send(new DeleteObjectCommand({ Bucket, Key: objectKey(key) }));
        },
        async get(key, range) {
            try {
                const res = await client.send(
                    new GetObjectCommand({
                        Bucket,
                        Key: objectKey(key),
                        Range: range ? rangeHeaderValue(range) : undefined,
                    }),
                );
                if (!res.Body) return null;
                // `ContentRange` is `bytes <start>-<end>/<total>`; a store that ignores Range sends the whole object.
                const served = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.ContentRange ?? '');
                return {
                    body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
                    size: served ? Number(served[3]) : (res.ContentLength ?? 0),
                    mtime: res.LastModified ?? null,
                    contentType: res.ContentType ?? null,
                    range: served ? { start: Number(served[1]), end: Number(served[2]) } : null,
                };
            } catch (error) {
                if (isMissing(error)) return null;
                if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 416) {
                    const head = await client.send(new HeadObjectCommand({ Bucket, Key: objectKey(key) }));
                    throw new RangeNotSatisfiableError(head.ContentLength ?? 0);
                }
                throw error;
            }
        },
        async *list(prefix = '') {
            let token: string | undefined;
            do {
                const page = await client.send(
                    new ListObjectsV2Command({ Bucket, Prefix: objectKey(prefix), ContinuationToken: token }),
                );
                for (const item of page.Contents ?? []) {
                    if (!item.Key?.startsWith(config.prefix)) continue;
                    const key = item.Key.slice(config.prefix.length);
                    if (!key || key.endsWith('/')) continue;
                    yield { key, size: item.Size ?? 0, mtime: item.LastModified ?? new Date() };
                }
                token = page.IsTruncated ? page.NextContinuationToken : undefined;
            } while (token);
        },
        async head(key) {
            try {
                const res = await client.send(new HeadObjectCommand({ Bucket, Key: objectKey(key) }));
                return { size: res.ContentLength ?? 0 };
            } catch (error) {
                if (isMissing(error)) return null;
                throw error;
            }
        },
        presignPut(key, contentType, size, expiresIn) {
            const command = new PutObjectCommand({
                Bucket,
                Key: objectKey(key),
                ContentType: contentType,
                ContentLength: size,
            });
            // The presigner leaves Content-Type unsigned by default; sign it (and the length) so the
            // browser cannot store a different type or size than the server approved.
            return getSignedUrl(client, command, {
                expiresIn,
                signableHeaders: new Set(['content-type', 'content-length']),
            });
        },
    };
}
