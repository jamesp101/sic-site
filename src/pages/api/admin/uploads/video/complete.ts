import { adminRoute, json } from '@/lib/server/api-route';
import { storageRouteUrl } from '@/lib/server/storage';
import { completeVideo } from '@/lib/server/video-intake';

export const prerender = false;

/**
 * Step 2 of a video upload: `{ key }` from `/api/admin/uploads/video`. Checks the key was issued to
 * this user and the object exists and fits, claims the pending upload (so expiry never deletes it)
 * and returns the app route URL (`/storage/<key>`, whatever `S3_PUBLIC_URL` is) to store in content.
 */
export const POST = adminRoute(async ({ request, user }) => {
    const body: { key?: unknown } | null = await request.json().catch(() => null);
    if (typeof body?.key !== 'string') return json({ message: 'Expected a JSON body with a key.' }, 400);
    const { key } = await completeVideo(user.id, body.key);
    return json({ url: storageRouteUrl(key) });
});
