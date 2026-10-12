import type { FileKind } from '@/lib/content-types';

const KINDS: Record<string, FileKind> = {
    pdf: 'pdf',
    doc: 'doc',
    docx: 'doc',
    odt: 'doc',
    rtf: 'doc',
    txt: 'doc',
    ppt: 'doc',
    pptx: 'doc',
    xls: 'sheet',
    xlsx: 'sheet',
    csv: 'sheet',
    ods: 'sheet',
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'image',
    avif: 'image',
    zip: 'archive',
    rar: 'archive',
    '7z': 'archive',
    tar: 'archive',
    gz: 'archive',
};

/** Lower-case extension without the dot; '' when the name has none. */
export function extensionOf(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? '';
    const dot = base.lastIndexOf('.');
    return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Accepts an extension with or without the leading dot. */
export function fileKind(extension: string): FileKind {
    return KINDS[extension.replace(/^\./, '').toLowerCase()] ?? 'other';
}
