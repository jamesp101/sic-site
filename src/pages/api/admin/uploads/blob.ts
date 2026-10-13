import type { APIRoute } from 'astro';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import {
    DIRECT_UPLOAD_CONTENT_TYPES,
    DIRECT_UPLOAD_PREFIX,
    isDirectUploadKey,
    issueUploadKey,
    verifyUploadTicket,
} from '@/lib/server/blob-upload';
import { AuthzError, requireUser } from '@/lib/server/authz';
import { directUploads, LIMITS, uploadPathname } from '@/lib/server/storage';

export const prerender = false;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Browser-direct uploads to Vercel Blob for files that would exceed Vercel's ~4.5 MB request limit.
 * Two JSON steps, both for signed-in users only:
 * 1. `{ type: 'issue-key', fileName }` returns a server-generated `downloads/<random>.<ext>` key,
 *    the blob `pathname` to upload to and a signed ticket bound to the user and key.
 * 2. `@vercel/blob/client` `upload()` posts `blob.generate-client-token`; the token is only issued for
 *    a pathname whose ticket verifies, limited to document/image types and LIMITS.download bytes.
 */
export const POST: APIRoute = async ({ request, locals }) => {
    if (!directUploads) return json({ message: 'Direct uploads are not enabled.' }, 404);

    let user;
    try {
        user = requireUser(locals.user);
    } catch (error) {
        if (error instanceof AuthzError) return json({ message: error.message }, error.status);
        throw error;
    }
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) return json({ message: 'Server is not configured for uploads.' }, 500);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ message: 'Expected a JSON body.' }, 400);
    }
    const type = (body as { type?: unknown } | null)?.type;

    if (type === 'issue-key') {
        const fileName = (body as { fileName?: unknown }).fileName;
        if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255) {
            return json({ message: 'A file name is required.' }, 400);
        }
        const { key, ticket } = issueUploadKey(secret, user.id, fileName);
        return json({ key, pathname: uploadPathname(key), ticket });
    }

    if (type !== 'blob.generate-client-token') return json({ message: 'Unsupported request.' }, 400);

    try {
        const result = await handleUpload({
            request,
            body: body as HandleUploadBody,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
                const key = keyFromPathname(pathname);
                if (!key || !verifyUploadTicket(secret, user.id, key, clientPayload)) {
                    throw new Error('Upload not permitted.');
                }
                return {
                    allowedContentTypes: DIRECT_UPLOAD_CONTENT_TYPES,
                    maximumSizeInBytes: LIMITS.download,
                    addRandomSuffix: false,
                    allowOverwrite: false,
                    validUntil: Date.now() + 10 * 60 * 1000,
                };
            },
        });
        return json(result);
    } catch (error) {
        return json({ message: error instanceof Error ? error.message : 'Upload failed.' }, 400);
    }
};

/** Maps a requested blob pathname back to its bare key; null unless it is exactly an issued `downloads/` key. */
function keyFromPathname(pathname: string): string | null {
    const start = pathname.lastIndexOf(DIRECT_UPLOAD_PREFIX);
    if (start < 0) return null;
    const key = pathname.slice(start);
    return isDirectUploadKey(key) && uploadPathname(key) === pathname ? key : null;
}
