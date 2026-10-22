import { describe, expect, it } from 'vite-plus/test';
import { isDirectUploadKey, newDirectUploadKey } from './direct-upload';
import { isAllowedContentType, storedType } from './file-types';

describe('direct upload keys', () => {
    it('issues random downloads/ keys with an allowlisted extension', () => {
        expect(newDirectUploadKey('Student Handbook.PDF', 'application/pdf')).toMatch(/^downloads\/[0-9a-f]{32}\.pdf$/);
        expect(newDirectUploadKey('no-extension', 'application/octet-stream')).toMatch(/^downloads\/[0-9a-f]{32}$/);
        expect(newDirectUploadKey('a.b/../c', 'text/plain')).toMatch(/^downloads\/[0-9a-f]{32}\.txt$/);
        expect(newDirectUploadKey('x.pdf', 'application/pdf')).not.toBe(newDirectUploadKey('x.pdf', 'application/pdf'));
    });

    it('never keeps an extension the storage route would serve as markup', () => {
        expect(newDirectUploadKey('x.html', 'image/png')).toMatch(/^downloads\/[0-9a-f]{32}\.png$/);
        expect(newDirectUploadKey('x.svg', 'application/pdf')).toMatch(/^downloads\/[0-9a-f]{32}\.pdf$/);
        expect(newDirectUploadKey('x.htm', 'text/html')).toMatch(/^downloads\/[0-9a-f]{32}$/);
    });

    it('only accepts server-shaped keys', () => {
        expect(isDirectUploadKey('downloads/0123456789abcdef0123456789abcdef.pdf')).toBe(true);
        expect(isDirectUploadKey('posts/0123456789abcdef0123456789abcdef.pdf')).toBe(false);
        expect(isDirectUploadKey('downloads/../x.pdf')).toBe(false);
        expect(isDirectUploadKey('downloads/chosen-by-client.pdf')).toBe(false);
    });
});

describe('upload content types', () => {
    it('accepts documents, archives and raster images', () => {
        for (const type of [
            'application/pdf',
            'application/zip',
            'application/x-zip-compressed',
            'text/csv',
            'image/png',
            'image/webp',
        ]) {
            expect(isAllowedContentType(type)).toBe(true);
        }
    });

    it('rejects executable, markup and unknown types', () => {
        for (const type of [
            'text/html',
            'image/svg+xml',
            'application/javascript',
            'application/octet-stream',
            '',
            'image/',
            'image/png\r\nx',
            'constructor',
        ]) {
            expect(isAllowedContentType(type)).toBe(false);
        }
    });

    it('stores the type implied by the extension, never the declared one', () => {
        expect(storedType('notes.txt', 'text/html')).toEqual({ ext: '.txt', contentType: 'text/plain' });
        expect(storedType('page.html', 'text/html')).toEqual({ ext: '', contentType: 'application/octet-stream' });
        expect(storedType('photo', 'image/jpeg')).toEqual({ ext: '.jpg', contentType: 'image/jpeg' });
    });
});
