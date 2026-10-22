import path from 'node:path';

/**
 * Extensions uploads may be stored under, with the only content type each is ever stored and served
 * as. Markup that browsers execute (HTML, SVG, XML, JS) is deliberately absent: such files keep no
 * extension and are stored as `application/octet-stream`.
 */
export const FILE_TYPES: Readonly<Record<string, string>> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
};

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
    ...Object.fromEntries(
        Object.entries(FILE_TYPES)
            .map(([ext, type]) => [type, ext])
            .reverse(),
    ),
    'application/x-zip-compressed': '.zip',
};

/** True for content types a browser may declare for an upload (each maps to an allowed extension). */
export function isAllowedContentType(type: string): boolean {
    return Object.hasOwn(EXTENSION_BY_TYPE, type);
}

/**
 * Extension and content type an upload is stored under: a known extension from the file name, else
 * the extension implied by a known declared type, else none. The client-declared type is never
 * stored as such, so a stored object can only be served as one of the `FILE_TYPES` types.
 */
export function storedType(fileName: string, declaredType: string): { ext: string; contentType: string } {
    const nameExt = path.extname(fileName).toLowerCase();
    const ext = Object.hasOwn(FILE_TYPES, nameExt)
        ? nameExt
        : Object.hasOwn(EXTENSION_BY_TYPE, declaredType)
          ? EXTENSION_BY_TYPE[declaredType]
          : '';
    return { ext, contentType: ext ? FILE_TYPES[ext] : 'application/octet-stream' };
}
