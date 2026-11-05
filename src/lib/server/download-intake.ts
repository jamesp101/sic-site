/**
 * Download intake: accepts the file of a Download from either a multipart `file` (local driver) or an
 * `uploadedKey` the browser sent straight to the bucket (`/api/admin/uploads/direct`), and returns the
 * stored `{ key, size }`. States the Download limits once. Free of `astro:*` imports.
 *
 * A direct upload is verified (it exists and fits) before its pending-upload claim is consumed, so a
 * missing object does not burn the claim; only the user the key was issued to can use it.
 */
import { z } from 'astro/zod';
import { isDirectUploadKey } from './direct-upload';
import { claimPendingUpload, ownsPendingUpload } from './pending-uploads';
import { RequestError } from './request-error';
import { directUploads, headUpload, LIMITS, MB, put, remove } from './storage';

export const DOWNLOAD_TOO_LARGE = `The file must not be larger than ${LIMITS.download / MB} MB.`;

/** Zod schema of the multipart Download file (field-level errors for the upload form). */
export const downloadFile = z
    .instanceof(File, { error: 'Choose a file to upload.' })
    .refine((file) => file.size > 0, 'Choose a file to upload.')
    .refine((file) => file.size <= LIMITS.download, DOWNLOAD_TOO_LARGE);

export interface DownloadIntakeDeps {
    directUploads: boolean;
    maxBytes: number;
    ownsPendingUpload(key: string, userId: number): Promise<boolean>;
    claimPendingUpload(key: string, userId: number): Promise<boolean>;
    headUpload(key: string): Promise<{ size: number } | null>;
    put(file: File): Promise<string>;
    remove(key: string): Promise<void>;
}

export interface AcceptedDownload {
    key: string;
    size: number;
}

export function createDownloadIntake(deps: DownloadIntakeDeps) {
    const invalid = () => new RequestError('BAD_REQUEST', 'Invalid uploaded file.');

    async function acceptDirectUpload(userId: number, key: string): Promise<AcceptedDownload> {
        if (!deps.directUploads || !isDirectUploadKey(key) || !(await deps.ownsPendingUpload(key, userId))) {
            throw invalid();
        }
        const uploaded = await deps.headUpload(key);
        if (!uploaded) throw new RequestError('BAD_REQUEST', 'The uploaded file was not found. Upload it again.');
        if (uploaded.size > deps.maxBytes) {
            // The claim is consumed so only the owner's rejected object is removed, once.
            if (await deps.claimPendingUpload(key, userId)) {
                await deps
                    .remove(key)
                    .catch((error: unknown) => console.error(`Stored file cleanup failed: ${key}`, error));
            }
            throw new RequestError('BAD_REQUEST', DOWNLOAD_TOO_LARGE);
        }
        if (!(await deps.claimPendingUpload(key, userId))) throw invalid();
        return { key, size: uploaded.size };
    }

    /** The accepted file is already stored; the caller removes it (`commitWithFiles({ adopted })`) if its row write fails. */
    async function acceptDownloadFile(
        userId: number,
        input: { file?: File | null; uploadedKey?: string | null },
    ): Promise<AcceptedDownload> {
        if (input.uploadedKey) return acceptDirectUpload(userId, input.uploadedKey);
        if (!input.file) throw new RequestError('BAD_REQUEST', 'Choose a file to upload.');
        return { key: await deps.put(input.file), size: input.file.size };
    }

    return { acceptDownloadFile };
}

export const { acceptDownloadFile } = createDownloadIntake({
    directUploads,
    maxBytes: LIMITS.download,
    ownsPendingUpload,
    claimPendingUpload,
    headUpload,
    put: (file) => put('downloads', file),
    remove,
});
