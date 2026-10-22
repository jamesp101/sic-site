import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
    /** Size of an existing object, or null when it does not exist. */
    head(key: string): Promise<{ size: number } | null>;
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
            await client.send(
                new PutObjectCommand({ Bucket, Key: objectKey(key), Body: body, ContentType: contentType }),
            );
        },
        async delete(key) {
            // S3 DeleteObject succeeds for missing keys, matching the local driver.
            await client.send(new DeleteObjectCommand({ Bucket, Key: objectKey(key) }));
        },
        async get(key) {
            try {
                const res = await client.send(new GetObjectCommand({ Bucket, Key: objectKey(key) }));
                if (!res.Body) return null;
                return {
                    body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
                    size: res.ContentLength ?? 0,
                    mtime: res.LastModified ?? null,
                    contentType: res.ContentType ?? null,
                };
            } catch (error) {
                if (isMissing(error)) return null;
                throw error;
            }
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
