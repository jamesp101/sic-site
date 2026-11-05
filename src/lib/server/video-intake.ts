/**
 * Video intake: the checks around a browser video upload (`/api/admin/uploads/video`). Free of
 * `astro:*` imports.
 *
 * - `validateVideoUpload` decides whether `{ fileName, contentType, size }` may be issued a key.
 * - `receive` (local driver) streams the PUT body to disk for a key issued to the same user.
 * - `complete` (both drivers) verifies the stored object, then claims the pending upload so that
 *   expiry never deletes it. As in `download-intake`, the claim is consumed only after the
 *   object is known to exist and fit, so a missing object does not burn it.
 */
import { VIDEO_TYPES } from '../video-types';
import { claimUploadedObject, assertIssuedTo } from './direct-intake';
import { isDirectUploadKey, VIDEO_UPLOAD_PREFIX } from './direct-upload';
import { storedType } from './file-types';
import { claimPendingUpload, ownsPendingUpload } from './pending-uploads';
import { RequestError } from './request-error';
import { discardFiles } from './stored-files';
import { headUpload, LIMITS, MB, receiveUpload } from './storage';
import { UploadTooLargeError } from './storage/errors';
import type { UploadRequest } from './upload-request';

export const VIDEO_MAX_MB = LIMITS.video / MB;
export const VIDEO_TOO_LARGE = `The video must not be larger than ${VIDEO_MAX_MB} MB.`;
export const VIDEO_TYPE_MESSAGE = 'Choose an MP4 or WebM video.';

export type VideoValidation = { ok: true; ext: string; contentType: string } | { ok: false; message: string };

/**
 * Accepts only MP4/WebM: the declared type must be a video type and the extension (from the file
 * name, else the declared type) must be a video extension. The returned `contentType` follows the
 * extension, and is what the upload must be sent as.
 */
export function validateVideoUpload(request: UploadRequest, maxBytes: number = LIMITS.video): VideoValidation {
    if (!Object.values(VIDEO_TYPES).includes(request.contentType)) return { ok: false, message: VIDEO_TYPE_MESSAGE };
    const stored = storedType(request.fileName, request.contentType);
    if (!Object.hasOwn(VIDEO_TYPES, stored.ext)) return { ok: false, message: VIDEO_TYPE_MESSAGE };
    if (request.size > maxBytes) return { ok: false, message: VIDEO_TOO_LARGE };
    return { ok: true, ext: stored.ext, contentType: stored.contentType };
}

/** True for a key `newDirectUploadKey(…, 'videos/')` could have issued, with a video extension. */
export function isVideoUploadKey(key: string): boolean {
    return isDirectUploadKey(key, VIDEO_UPLOAD_PREFIX) && Object.hasOwn(VIDEO_TYPES, key.slice(key.lastIndexOf('.')));
}

export interface VideoIntakeDeps {
    maxBytes: number;
    ownsPendingUpload(key: string, userId: number): Promise<boolean>;
    claimPendingUpload(key: string, userId: number): Promise<boolean>;
    headUpload(key: string): Promise<{ size: number } | null>;
    receiveUpload(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number>;
    discardFiles(keys: readonly string[], context: string): Promise<void>;
}

export function createVideoIntake(deps: VideoIntakeDeps) {
    /**
     * Local driver: streams `body` to the issued `key`. Stops and removes the file once more than
     * `size` (the size declared when the key was issued, at most `maxBytes`) arrive, and removes it
     * again when fewer arrive, so a stored file always has exactly the declared size.
     */
    async function receive(
        userId: number,
        key: string,
        size: number,
        body: ReadableStream<Uint8Array> | null,
    ): Promise<{ size: number }> {
        await assertIssuedTo(deps, userId, key, isVideoUploadKey(key));
        if (!Number.isInteger(size) || size <= 0) throw new RequestError('BAD_REQUEST', 'Choose a file to upload.');
        if (size > deps.maxBytes) throw new RequestError('BAD_REQUEST', VIDEO_TOO_LARGE);
        if (!body) throw new RequestError('BAD_REQUEST', 'Choose a file to upload.');
        let written: number;
        try {
            written = await deps.receiveUpload(key, body, size);
        } catch (error) {
            if (error instanceof UploadTooLargeError) {
                throw new RequestError('BAD_REQUEST', 'The video is larger than the size it was announced with.');
            }
            throw error;
        }
        if (written !== size) {
            await deps.discardFiles([key], 'incomplete video upload');
            throw new RequestError('BAD_REQUEST', 'The upload was incomplete. Try again.');
        }
        return { size: written };
    }

    /** Verifies the uploaded object and claims the pending upload (see `claimUploadedObject`); the object is then kept. */
    function complete(userId: number, key: string): Promise<{ key: string; size: number }> {
        return claimUploadedObject(deps, userId, key, {
            validKey: isVideoUploadKey(key),
            maxBytes: deps.maxBytes,
            messages: {
                missing: 'The uploaded video was not found. Upload it again.',
                empty: 'The uploaded video is empty.',
                tooLarge: VIDEO_TOO_LARGE,
            },
            context: 'rejected video upload',
        });
    }

    return { receive, complete };
}

export const { receive: receiveVideo, complete: completeVideo } = createVideoIntake({
    maxBytes: LIMITS.video,
    ownsPendingUpload,
    claimPendingUpload,
    headUpload,
    receiveUpload,
    discardFiles,
});
