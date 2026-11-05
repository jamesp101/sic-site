import { describe, expect, it } from 'vite-plus/test';
import { plainLinkUrl } from './link-intent';

const here = new URL('https://sic.test/posts?page=2#top');
const link = (href: string, extra: { target?: string; download?: boolean } = {}) =>
    plainLinkUrl({ href, target: extra.target ?? '', download: extra.download ?? false }, here);

describe('plainLinkUrl', () => {
    it('accepts a same-origin link to another document', () => {
        expect(link('/about')?.href).toBe('https://sic.test/about');
        expect(link('https://sic.test/posts?page=3')?.href).toBe('https://sic.test/posts?page=3');
    });

    it('rejects other origins', () => {
        expect(link('https://example.org/about')).toBeNull();
        expect(link('http://sic.test/about')).toBeNull();
    });

    it('rejects new-tab links and downloads, but not target=_self', () => {
        expect(link('/about', { target: '_blank' })).toBeNull();
        expect(link('/files/a.pdf', { download: true })).toBeNull();
        expect(link('/about', { target: '_self' })?.pathname).toBe('/about');
    });

    it('rejects the same document, including a different #hash only', () => {
        expect(link('/posts?page=2')).toBeNull();
        expect(link('#contact')).toBeNull();
        expect(link('/posts?page=2#other')).toBeNull();
        expect(link('/posts?page=1')?.search).toBe('?page=1');
    });
});
