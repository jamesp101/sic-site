import {
    DeleteObjectCommand,
    GetObjectCommand,
    NoSuchKey,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
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

/** Objects in an S3-compatible bucket. Credentials fall back to the AWS default chain when not set. */
export function createS3Driver(config: S3Config): StorageDriver {
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
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
                if (error instanceof NoSuchKey) return null;
                if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
                throw error;
            }
        },
    };
}
