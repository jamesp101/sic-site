import { compressImage } from '@/lib/image-compress';

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

/**
 * Uploads a Download file straight to the S3 bucket through a presigned URL (request bodies over
 * ~4.5 MB never reach the server) and returns its stored key. `onProgress` gets 0–100. Throws an
 * `Error` with a user-presentable message when the upload fails.
 */
export async function uploadDownloadDirect(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const contentType = file.type || 'application/octet-stream';
    const issued = await fetch('/api/admin/uploads/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType, size: file.size }),
    });
    const grant = (await issued.json().catch(() => null)) as { key: string; url: string; message?: string } | null;
    if (!issued.ok || !grant?.key) throw new Error(grant?.message ?? 'Could not start the upload.');
    // XHR rather than fetch: only XHR reports upload progress.
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', grant.url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`The upload failed (HTTP ${xhr.status}).`));
    xhr.onerror = () => reject(new Error('The upload failed. Check your connection and try again.'));
    xhr.send(file);
    await promise;
    return grant.key;
}
