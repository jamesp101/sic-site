/**
 * The JSON body both direct-upload endpoints take (`/api/admin/uploads/direct` for Downloads,
 * `/api/admin/uploads/video` for videos). Free of `astro:*` imports.
 */
import { RequestError } from './request-error';

export interface UploadRequest {
    fileName: string;
    /** The browser's declared type; `''` when missing. Callers check it against their own allowlist. */
    contentType: string;
    size: number;
}

/** Reads `{ fileName, contentType, size }`; throws `RequestError` (400) when the shape is wrong. Types and limits are the caller's. */
export async function readUploadRequest(request: Request): Promise<UploadRequest> {
    let body: { fileName?: unknown; contentType?: unknown; size?: unknown } | null;
    try {
        body = await request.json();
    } catch {
        throw new RequestError('BAD_REQUEST', 'Expected a JSON body.');
    }
    const { fileName, contentType, size } = body ?? {};
    if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255) {
        throw new RequestError('BAD_REQUEST', 'A file name is required.');
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
        throw new RequestError('BAD_REQUEST', 'Choose a file to upload.');
    }
    return { fileName, contentType: typeof contentType === 'string' ? contentType : '', size };
}
