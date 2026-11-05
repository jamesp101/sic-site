import { adminRoute, json } from '@/lib/server/api-route';
import { newDirectUploadKey, VIDEO_UPLOAD_PREFIX } from '@/lib/server/direct-upload';
import { registerPendingUpload } from '@/lib/server/pending-uploads';
import { assertUploadQuota } from '@/lib/server/rate-limit';
import { directUploads, presignUpload } from '@/lib/server/storage';
import { readUploadRequest } from '@/lib/server/upload-request';
import { receiveVideo, validateVideoUpload } from '@/lib/server/video-intake';

export const prerender = false;

/**
 * Step 1 of a video upload. A signed-in user posts `{ fileName, contentType, size }` (MP4/WebM, up to
 * 100 MB); the response is a server-generated `videos/<random>.<ext>` key (recorded in
 * `pending_uploads` for this user) and where to PUT the bytes: a 10-minute presigned bucket URL on
 * `s3`, this route's own `PUT` on `local`. `contentType` is the type to send with the PUT. Step 2 is
 * `/api/admin/uploads/video/complete`.
 */
export const POST = adminRoute(async ({ request, user }) => {
    const upload = await readUploadRequest(request);
    const checked = validateVideoUpload(upload);
    if (!checked.ok) return json({ message: checked.message }, 422);
    await assertUploadQuota(user.id);

    const key = newDirectUploadKey(upload.fileName, checked.contentType, VIDEO_UPLOAD_PREFIX);
    await registerPendingUpload(key, user.id);
    const url = directUploads
        ? await presignUpload(key, checked.contentType, upload.size)
        : `/api/admin/uploads/video?${new URLSearchParams({ key, size: String(upload.size) })}`;
    return json({ key, url, contentType: checked.contentType });
});

/**
 * Local driver only: receives the video bytes for a key issued by `POST` to the same user, streamed to
 * disk without buffering and stopped once they exceed the announced size. A cross-site page cannot
 * call this: a PUT with credentials always needs a CORS preflight, which this app never answers.
 */
export const PUT = adminRoute(async ({ request, user }) => {
    if (directUploads) return json({ message: 'Videos are uploaded straight to the bucket.' }, 404);
    const params = new URL(request.url).searchParams;
    await receiveVideo(user.id, params.get('key') ?? '', Number(params.get('size')), request.body);
    return new Response(null, { status: 204 });
});
