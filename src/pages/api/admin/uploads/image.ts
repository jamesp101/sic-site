import { adminRoute, json } from '@/lib/server/api-route';
import { RequestError } from '@/lib/server/request-error';
import { acceptImage, isImageIntakeKind } from '@/lib/server/image-intake';

export const prerender = false;

/**
 * Image upload for the content editor and the slide designer's Layer images. Multipart form with
 * `image` and `kind` (`content` | `layer`, default `content`). Returns `{ url }`.
 */
export const POST = adminRoute(async ({ request, user }) => {
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        throw new RequestError('BAD_REQUEST', 'Expected multipart form data.');
    }
    const kind = form.get('kind') ?? 'content';
    if (!isImageIntakeKind(kind)) throw new RequestError('BAD_REQUEST', 'Unknown image kind.');

    const { url } = await acceptImage(user.id, kind, form.get('image'));
    return json({ url });
});
