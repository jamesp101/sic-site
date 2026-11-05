import { adminRoute, json } from '@/lib/server/api-route';
import { RequestError } from '@/lib/server/request-error';
import { newDirectUploadKey } from '@/lib/server/direct-upload';
import { DOWNLOAD_TOO_LARGE } from '@/lib/server/download-intake';
import { isAllowedContentType, isVideoUpload } from '@/lib/server/file-types';
import { registerPendingUpload } from '@/lib/server/pending-uploads';
import { assertUploadQuota } from '@/lib/server/rate-limit';
import { directUploads, LIMITS, presignUpload } from '@/lib/server/storage';
import { readUploadRequest } from '@/lib/server/upload-request';

export const prerender = false;

/**
 * Browser-direct uploads to the S3 bucket for files that would exceed Vercel's ~4.5 MB request limit.
 * A signed-in user posts `{ fileName, contentType, size }`; the response is a server-generated
 * `downloads/<random>.<ext>` key and a 10-minute presigned PUT URL that only accepts exactly that
 * content type and size. The key is recorded as issued to this user: only they can attach it with
 * `downloads.create` (which re-checks the stored size); an abandoned object is reclaimed by the orphan cleanup.
 */
export const POST = adminRoute(async ({ request, user }) => {
    if (!directUploads) throw new RequestError('NOT_FOUND', 'Direct uploads are not enabled.');

    const { fileName, contentType, size } = await readUploadRequest(request);
    // Downloads keep their own allowlist: every `FILE_TYPES` entry except videos, which only the video upload accepts.
    if (!isAllowedContentType(contentType) || isVideoUpload(fileName, contentType)) {
        throw new RequestError('UNPROCESSABLE_CONTENT', 'This file type is not allowed.');
    }
    if (size > LIMITS.download) throw new RequestError('UNPROCESSABLE_CONTENT', DOWNLOAD_TOO_LARGE);
    await assertUploadQuota(user.id);

    const key = newDirectUploadKey(fileName, contentType);
    await registerPendingUpload(key, user.id);
    return json({ key, url: await presignUpload(key, contentType, size) });
});
