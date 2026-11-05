/**
 * Uploaded-video types and limit, shared by the server (`file-types.ts`, storage `LIMITS.video`) and
 * the browser (`uploadVideo`, file pickers). Free of server imports.
 */

/** Video extensions and the only content type each is stored and served as. */
export const VIDEO_TYPES: Readonly<Record<string, string>> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
};

/** Largest uploaded video, in bytes. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/** Value for `<input accept>` on a video picker. */
export const VIDEO_ACCEPT = 'video/mp4,video/webm,.mp4,.webm';

/** The video content type of a file: its extension decides, else its declared type; null when it is not MP4/WebM. */
export function videoContentType(fileName: string, declaredType: string): string | null {
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
    if (Object.hasOwn(VIDEO_TYPES, ext)) return VIDEO_TYPES[ext];
    return Object.values(VIDEO_TYPES).includes(declaredType) ? declaredType : null;
}
