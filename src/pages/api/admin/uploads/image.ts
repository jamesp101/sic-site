import { adminRoute, json } from '@/lib/server/api-route';
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
        return json({ message: 'Expected multipart form data.' }, 400);
    }
    const kind = form.get('kind') ?? 'content';
    if (!isImageIntakeKind(kind)) return json({ message: 'Unknown image kind.' }, 400);

    const { url } = await acceptImage(user.id, kind, form.get('image'));
    return json({ url });
});
