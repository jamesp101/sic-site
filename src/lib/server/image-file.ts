import { z } from 'astro/zod';
import type { ImageTargetName } from '@/lib/image-compress';
import { toWebp } from './image-webp';
import { MB } from './storage';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/**
 * Zod schema for an uploaded raster image of at most `maxBytes`. The parsed value is the image
 * re-encoded as WebP for `target` (`toWebp`), so every stored image upload is WebP. Needs async
 * parsing (`safeParseAsync`; Astro actions already parse asynchronously).
 */
export function imageFile(maxBytes: number, target: ImageTargetName) {
    return z
        .instanceof(File, { error: 'Choose an image file.' })
        .refine((file) => IMAGE_TYPES.includes(file.type), 'The file must be a JPG, PNG, WebP, GIF or AVIF image.')
        .refine((file) => file.size <= maxBytes, `The image must not be larger than ${Math.round(maxBytes / MB)} MB.`)
        .transform(async (file, ctx) => {
            try {
                return await toWebp(file, target);
            } catch {
                ctx.addIssue({ code: 'custom', message: 'The image could not be read. Choose another file.' });
                return z.NEVER;
            }
        });
}
