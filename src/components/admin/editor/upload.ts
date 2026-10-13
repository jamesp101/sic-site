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

/**
 * Compresses to WebP in the browser (content box, 1600 px) before uploading.
 * Throws an `Error` with a user-presentable message when the upload fails.
 */
export async function uploadImage(original: File): Promise<UploadedImage> {
    const file = await compressImage(original, 'content');
    const form = new FormData();
    form.append('image', file);
    const [response, size] = await Promise.all([
        fetch('/api/admin/uploads/image', { method: 'POST', body: form }),
        measure(file),
    ]);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
        throw new Error(message || 'Upload failed. Please try again.');
    }
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
        throw new Error('Upload failed. Please try again.');
    }
    return { url: body.url, ...size };
}
