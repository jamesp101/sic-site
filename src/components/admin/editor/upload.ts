import { compressImage } from '@/lib/image-compress';
import { VIDEO_MAX_BYTES, videoContentType } from '@/lib/video-types';

/** Uploads an image through the inline upload API and reads its natural size (for width/height attributes). */
export interface UploadedImage {
    url: string;
    width: number | null;
    height: number | null;
}

function measure(file: File): Promise<{ width: number | null; height: number | null }> {
    const { promise, resolve } = Promise.withResolvers<{ width: number | null; height: number | null }>();
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const done = (size: { width: number | null; height: number | null }) => {
        URL.revokeObjectURL(objectUrl);
        resolve(size);
    };
    image.onload = () => done({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    image.onerror = () => done({ width: null, height: null });
    image.src = objectUrl;
    return promise;
}

/** Image kinds the upload API accepts; each is also the `compressImage` target. */
export type UploadKind = 'content' | 'layer';

/**
 * Compresses `original` to WebP for `kind` (`compressImage(file, kind)`), posts it to the image upload
 * API and returns the stored URL together with the compressed file. Throws an `Error` with a
 * user-presentable message when the upload fails.
 */
export async function postImage(original: File, kind: UploadKind): Promise<{ url: string; file: File }> {
    const file = await compressImage(original, kind);
    const form = new FormData();
    form.append('image', file);
    form.append('kind', kind);
    const response = await fetch('/api/admin/uploads/image', { method: 'POST', body: form }).catch(() => null);
    const body: unknown = await response?.json().catch(() => null);
    if (!response?.ok) {
        const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
        throw new Error(message || 'Upload failed. Please try again.');
    }
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
        throw new Error('Upload failed. Please try again.');
    }
    return { url: body.url, file };
}

/** Uploads a content image (1600 px box) and reads its natural size (for width/height attributes). */
export async function uploadImage(original: File): Promise<UploadedImage> {
    const { url, file } = await postImage(original, 'content');
    return { url, ...(await measure(file)) };
}

/** Server error text (`{ message }` JSON) of a failed response body, or ''. */
function messageOf(body: unknown): string {
    return body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
}

/** POSTs `payload` as JSON and returns the parsed JSON object; throws the server's message, else `fallback`. */
async function postJson(url: string, payload: unknown, fallback: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => null);
    const body: unknown = await response?.json().catch(() => null);
    if (!response?.ok) throw new Error(messageOf(body) || fallback);
    if (!body || typeof body !== 'object') throw new Error(fallback);
    return body as Record<string, unknown>;
}

/**
 * PUTs `file` to `url` (a presigned bucket URL, or the app's own upload route) with `contentType`.
 * XHR rather than fetch: only XHR reports upload progress (`onProgress` gets 0–1).
 */
function putFile(url: string, contentType: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let message = '';
        try {
            message = messageOf(JSON.parse(xhr.responseText));
        } catch {
            // A bucket answers with XML, not a readable message.
        }
        reject(new Error(message || `The upload failed (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('The upload failed. Check your connection and try again.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
    xhr.send(file);
    return promise;
}

/**
 * Uploads a Download file straight to the S3 bucket through a presigned URL (request bodies over
 * ~4.5 MB never reach the server) and returns its stored key. `onProgress` gets 0–100. Throws an
 * `Error` with a user-presentable message when the upload fails.
 */
export async function uploadDownloadDirect(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const contentType = file.type || 'application/octet-stream';
    const grant = await postJson(
        '/api/admin/uploads/direct',
        { fileName: file.name, contentType, size: file.size },
        'Could not start the upload.',
    );
    if (typeof grant.key !== 'string' || typeof grant.url !== 'string') throw new Error('Could not start the upload.');
    await putFile(grant.url, contentType, file, onProgress && ((fraction) => onProgress(Math.round(fraction * 100))));
    return grant.key;
}

/**
 * Uploads an MP4/WebM video (up to 100 MB) and returns its public URL. Three steps: the server issues
 * a key and a PUT target (a presigned bucket URL on `s3`, its own route on `local`), the browser
 * PUTs the bytes with progress (`onProgress` gets 0–1), and the server verifies and claims the upload.
 * Type and size are checked before anything is sent. Throws an `Error` with a user-presentable message.
 */
export async function uploadVideo(file: File, onProgress?: (fraction: number) => void): Promise<{ url: string }> {
    const contentType = videoContentType(file.name, file.type);
    if (!contentType) throw new Error('Choose an MP4 or WebM video.');
    if (file.size === 0) throw new Error('Choose a video to upload.');
    if (file.size > VIDEO_MAX_BYTES)
        throw new Error(`The video must not be larger than ${VIDEO_MAX_BYTES / 1024 / 1024} MB.`);

    const grant = await postJson(
        '/api/admin/uploads/video',
        { fileName: file.name, contentType, size: file.size },
        'Could not start the upload.',
    );
    if (typeof grant.key !== 'string' || typeof grant.url !== 'string' || typeof grant.contentType !== 'string') {
        throw new Error('Could not start the upload.');
    }
    onProgress?.(0);
    await putFile(grant.url, grant.contentType, file, onProgress);
    const done = await postJson(
        '/api/admin/uploads/video/complete',
        { key: grant.key },
        'Could not finish the upload.',
    );
    if (typeof done.url !== 'string') throw new Error('Could not finish the upload.');
    onProgress?.(1);
    return { url: done.url };
}
