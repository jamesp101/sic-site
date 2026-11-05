import { adminRoute, json } from '@/lib/server/api-route';
import { newDirectUploadKey } from '@/lib/server/direct-upload';
import { DOWNLOAD_TOO_LARGE } from '@/lib/server/download-intake';
import { isAllowedContentType } from '@/lib/server/file-types';
import { registerPendingUpload, sweepPendingUploads } from '@/lib/server/pending-uploads';
import { assertUploadQuota } from '@/lib/server/rate-limit';
import { directUploads, LIMITS, presignUpload } from '@/lib/server/storage';

export const prerender = false;

/**
 * Browser-direct uploads to the S3 bucket for files that would exceed Vercel's ~4.5 MB request limit.
 * A signed-in user posts `{ fileName, contentType, size }`; the response is a server-generated
 * `downloads/<random>.<ext>` key and a 10-minute presigned PUT URL that only accepts exactly that
 * content type and size. The key is recorded as issued to this user: only they can attach it with
 * `downloads.create` (which re-checks the stored size), and unclaimed keys are swept with their objects.
 */
export const POST = adminRoute(async ({ request, user }) => {
    if (!directUploads) return json({ message: 'Direct uploads are not enabled.' }, 404);

    let body: { fileName?: unknown; contentType?: unknown; size?: unknown } | null;
    try {
        body = await request.json();
    } catch {
        return json({ message: 'Expected a JSON body.' }, 400);
    }
    const { fileName, contentType, size } = body ?? {};
    if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255) {
        return json({ message: 'A file name is required.' }, 400);
    }
    if (typeof contentType !== 'string' || !isAllowedContentType(contentType)) {
        return json({ message: 'This file type is not allowed.' }, 422);
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
        return json({ message: 'Choose a file to upload.' }, 400);
    }
    if (size > LIMITS.download) return json({ message: DOWNLOAD_TOO_LARGE }, 422);
    await assertUploadQuota(user.id);

    await sweepPendingUploads();
    const key = newDirectUploadKey(fileName, contentType);
    await registerPendingUpload(key, user.id);
    return json({ key, url: await presignUpload(key, contentType, size) });
});
