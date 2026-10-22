import type { APIRoute } from 'astro';
import { AuthzError, requireUser } from '@/lib/server/authz';
import { isDirectUploadContentType, newDirectUploadKey } from '@/lib/server/direct-upload';
import { directUploads, LIMITS, MB, presignUpload } from '@/lib/server/storage';

export const prerender = false;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Browser-direct uploads to the S3 bucket for files that would exceed Vercel's ~4.5 MB request limit.
 * A signed-in user posts `{ fileName, contentType, size }`; the response is a server-generated
 * `downloads/<random>.<ext>` key and a 10-minute presigned PUT URL that only accepts exactly that
 * content type and size. `downloads.create` then receives the key and re-checks the stored size.
 */
export const POST: APIRoute = async ({ request, locals }) => {
    if (!directUploads) return json({ message: 'Direct uploads are not enabled.' }, 404);

    try {
        requireUser(locals.user);
    } catch (error) {
        if (error instanceof AuthzError) return json({ message: error.message }, error.status);
        throw error;
    }

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
    if (typeof contentType !== 'string' || !isDirectUploadContentType(contentType)) {
        return json({ message: 'This file type is not allowed.' }, 422);
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
        return json({ message: 'Choose a file to upload.' }, 400);
    }
    if (size > LIMITS.download) {
        return json({ message: `The file must not be larger than ${LIMITS.download / MB} MB.` }, 422);
    }

    const key = newDirectUploadKey(fileName);
    return json({ key, url: await presignUpload(key, contentType, size) });
};
