import { z } from 'astro/zod';
import type { ImageTargetName } from '@/lib/image-compress';
import { toWebp } from './image-webp';
import { RequestError } from './request-error';
import { MB } from './storage';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/**
 * An uploaded image that passed the cheap checks (declared type, size) and still has to become a WebP
 * for `target`. Conversion decodes the file with sharp, so it only runs after the sign-in check: in
 * `commitWithFiles` and the image intake (`storedImage`), never while the action input is validated.
 */
export class ImageUpload extends File {
    readonly target: ImageTargetName;

    constructor(file: File, target: ImageTargetName) {
        super([file], file.name, { type: file.type, lastModified: file.lastModified });
        this.target = target;
    }
}

/**
 * Zod schema for an uploaded raster image of at most `maxBytes`: type and size only. The parsed value is an
 * `ImageUpload`; `storedImage` (called by `commitWithFiles` and the image intake) re-encodes it as WebP for
 * `target`, so every stored image upload is WebP.
 */
export function imageFile(maxBytes: number, target: ImageTargetName) {
    return z
        .instanceof(File, { error: 'Choose an image file.' })
        .refine((file) => IMAGE_TYPES.includes(file.type), 'The file must be a JPG, PNG, WebP, GIF or AVIF image.')
        .refine((file) => file.size <= maxBytes, `The image must not be larger than ${Math.round(maxBytes / MB)} MB.`)
        .transform((file) => new ImageUpload(file, target));
}

/**
 * The file to store: an `ImageUpload` becomes its WebP (the real format is checked there, not the declared
 * one); any other file is returned as is. Throws RequestError BAD_REQUEST for an unreadable or disallowed image.
 */
export async function storedImage(file: File): Promise<File> {
    if (!(file instanceof ImageUpload)) return file;
    try {
        return await toWebp(file, file.target);
    } catch {
        throw new RequestError('BAD_REQUEST', 'The image could not be read. Choose another file.');
    }
}
