import type { APIRoute } from 'astro';
import { AuthzError, requireUser } from '@/lib/server/authz';
import { imageFile } from '@/lib/server/image-file';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit';
import { LIMITS, publicUrl, put } from '@/lib/server/storage';

export const prerender = false;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Inline image upload for the Markdown editor. Returns `{ url }`. */
export const POST: APIRoute = async ({ request, locals }) => {
    let user;
    try {
        user = requireUser(locals.user);
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

    // Counted before decoding: conversion to WebP is the expensive part.
    if (!(await consumeRateLimit(`upload:${user.id}`, RATE_LIMITS.upload))) {
        return json({ message: 'Too many uploads. Try again in a few minutes.' }, 429);
    }
    const parsed = await imageFile(LIMITS.image, 'content').safeParseAsync(form.get('image'));
    if (!parsed.success) return json({ message: parsed.error.issues[0]?.message ?? 'Invalid image.' }, 422);

    const key = await put('posts/inline', parsed.data);
    return json({ url: publicUrl(key) });
};
