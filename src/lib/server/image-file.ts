import { z } from 'astro/zod';
import { MB } from './storage';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Zod schema for an uploaded raster image of at most `maxBytes`. */
export function imageFile(maxBytes: number) {
    return z
        .instanceof(File, { error: 'Choose an image file.' })
        .refine((file) => IMAGE_TYPES.includes(file.type), 'The file must be a JPG, PNG, WebP, GIF or AVIF image.')
        .refine((file) => file.size <= maxBytes, `The image must not be larger than ${Math.round(maxBytes / MB)} MB.`);
}
