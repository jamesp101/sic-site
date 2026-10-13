import { describe, expect, it } from 'vite-plus/test';
import { isDirectUploadKey, issueUploadKey, verifyUploadTicket } from './blob-upload';

const SECRET = 'test-secret-test-secret-test-secret';

describe('direct upload keys', () => {
    it('issues random downloads/ keys with a sanitised extension', () => {
        const { key } = issueUploadKey(SECRET, 1, 'Student Handbook.PDF');
        expect(key).toMatch(/^downloads\/[0-9a-f]{32}\.pdf$/);
        expect(issueUploadKey(SECRET, 1, 'no-extension').key).toMatch(/^downloads\/[0-9a-f]{32}$/);
        expect(issueUploadKey(SECRET, 1, 'a.b/../c').key).toMatch(/^downloads\/[0-9a-f]{32}$/);
        expect(issueUploadKey(SECRET, 1, 'x.pdf').key).not.toBe(issueUploadKey(SECRET, 1, 'x.pdf').key);
    });

    it('only accepts server-shaped keys', () => {
        expect(isDirectUploadKey('downloads/0123456789abcdef0123456789abcdef.pdf')).toBe(true);
        expect(isDirectUploadKey('posts/0123456789abcdef0123456789abcdef.pdf')).toBe(false);
        expect(isDirectUploadKey('downloads/../x.pdf')).toBe(false);
        expect(isDirectUploadKey('downloads/chosen-by-client.pdf')).toBe(false);
    });
});

describe('upload tickets', () => {
    const now = 1_000_000;

    it('verifies for the issued user and key only', () => {
        const { key, ticket } = issueUploadKey(SECRET, 7, 'a.pdf', now);
        expect(verifyUploadTicket(SECRET, 7, key, ticket, now + 1000)).toBe(true);
        expect(verifyUploadTicket(SECRET, 8, key, ticket, now + 1000)).toBe(false);
        expect(verifyUploadTicket(SECRET, 7, issueUploadKey(SECRET, 7, 'a.pdf', now).key, ticket, now + 1000)).toBe(
            false,
        );
        expect(verifyUploadTicket('other-secret', 7, key, ticket, now + 1000)).toBe(false);
    });

    it('rejects expired, missing and malformed tickets', () => {
        const { key, ticket } = issueUploadKey(SECRET, 7, 'a.pdf', now);
        expect(verifyUploadTicket(SECRET, 7, key, ticket, now + 11 * 60 * 1000)).toBe(false);
        expect(verifyUploadTicket(SECRET, 7, key, null, now)).toBe(false);
        expect(verifyUploadTicket(SECRET, 7, key, 'garbage', now)).toBe(false);
        expect(verifyUploadTicket(SECRET, 7, key, `${now + 99999}.AAAA`, now)).toBe(false);
    });
});
