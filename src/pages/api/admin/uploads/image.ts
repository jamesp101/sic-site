import type { APIRoute } from 'astro';
import { AuthzError, requireUser } from '@/lib/server/authz';
import { imageFile } from '@/lib/server/image-file';
import { LIMITS, publicUrl, put } from '@/lib/server/storage';

export const prerender = false;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Inline image upload for the Markdown editor. Returns `{ url }`. */
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        requireUser(locals.user);
    } catch (error) {
        if (error instanceof AuthzError) return json({ message: error.message }, error.status);
        throw error;
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return json({ message: 'Expected multipart form data.' }, 400);
    }

    const parsed = imageFile(LIMITS.image).safeParse(form.get('image'));
    if (!parsed.success) return json({ message: parsed.error.issues[0]?.message ?? 'Invalid image.' }, 422);

    const key = await put('posts/inline', parsed.data);
    return json({ url: publicUrl(key) });
};
