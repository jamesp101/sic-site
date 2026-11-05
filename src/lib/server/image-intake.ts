/**
 * Image intake for uploads that are not yet attached to a record: inline content images and slide
 * Layer images. One seam for the rate limit, the WebP conversion (`imageFile`) and storage.
 * Free of `astro:*` imports.
 */
import type { ImageTargetName } from '@/lib/image-compress';
import { imageFile } from './image-file';
import { assertUploadQuota } from './rate-limit';
import { RequestError } from './request-error';
import { LIMITS, publicUrl, put, type StoragePrefix } from './storage';

/** Intake kinds: the image target (also the browser's compression box) and where the file is stored. Layer images stay under `carousels/` so `unusedLayerImageKeys` finds them. */
export const IMAGE_INTAKES = {
    content: { prefix: 'posts/inline', target: 'content' },
    layer: { prefix: 'carousels', target: 'layer' },
} as const satisfies Record<string, { prefix: StoragePrefix; target: ImageTargetName }>;

export type ImageIntakeKind = keyof typeof IMAGE_INTAKES;

export function isImageIntakeKind(value: unknown): value is ImageIntakeKind {
    return typeof value === 'string' && Object.hasOwn(IMAGE_INTAKES, value);
}

/**
 * Accepts an uploaded image from `userId`: rate limit first (conversion is the expensive part), then
 * WebP conversion, then storage. Throws RequestError for a rejected image or an exhausted quota.
 */
export async function acceptImage(
    userId: number,
    kind: ImageIntakeKind,
    raw: unknown,
): Promise<{ key: string; url: string }> {
    const { prefix, target } = IMAGE_INTAKES[kind];
    await assertUploadQuota(userId);
    const parsed = await imageFile(LIMITS.image, target).safeParseAsync(raw);
    if (!parsed.success) throw new RequestError('BAD_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid image.');
    const key = await put(prefix, parsed.data);
    return { key, url: publicUrl(key) as string };
}
