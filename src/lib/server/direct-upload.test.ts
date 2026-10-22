import { describe, expect, it } from 'vite-plus/test';
import { isDirectUploadContentType, isDirectUploadKey, newDirectUploadKey } from './direct-upload';

describe('direct upload keys', () => {
    it('issues random downloads/ keys with a sanitised extension', () => {
        expect(newDirectUploadKey('Student Handbook.PDF')).toMatch(/^downloads\/[0-9a-f]{32}\.pdf$/);
        expect(newDirectUploadKey('no-extension')).toMatch(/^downloads\/[0-9a-f]{32}$/);
        expect(newDirectUploadKey('a.b/../c')).toMatch(/^downloads\/[0-9a-f]{32}$/);
        expect(newDirectUploadKey('x.pdf')).not.toBe(newDirectUploadKey('x.pdf'));
    });

    it('only accepts server-shaped keys', () => {
        expect(isDirectUploadKey('downloads/0123456789abcdef0123456789abcdef.pdf')).toBe(true);
        expect(isDirectUploadKey('posts/0123456789abcdef0123456789abcdef.pdf')).toBe(false);
        expect(isDirectUploadKey('downloads/../x.pdf')).toBe(false);
        expect(isDirectUploadKey('downloads/chosen-by-client.pdf')).toBe(false);
    });
});

describe('direct upload content types', () => {
    it('accepts documents, archives and images', () => {
        for (const type of ['application/pdf', 'application/zip', 'text/csv', 'image/png', 'image/webp']) {
            expect(isDirectUploadContentType(type)).toBe(true);
        }
    });

    it('rejects executable, markup and unknown types', () => {
        for (const type of [
            'text/html',
            'application/javascript',
            'application/octet-stream',
            '',
            'image/',
            'image/png\r\nx',
        ]) {
            expect(isDirectUploadContentType(type)).toBe(false);
        }
    });
});
