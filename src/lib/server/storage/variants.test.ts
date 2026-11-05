import { describe, expect, it } from 'vite-plus/test';
import { isVariantKey, originalCandidates, variantBase, variantKeyOf, variantKeysOf } from './variants';

describe('variant keys', () => {
    it('derives the variant of a Highlight image only', () => {
        expect(variantKeyOf('posts/abc.webp', 640)).toBe('posts/abc.w640.webp');
        expect(variantKeyOf('posts/abc.JPG', 640)).toBe('posts/abc.w640.webp');
        expect(variantKeyOf('posts/abc.webp', 960)).toBeNull();
        expect(variantKeyOf('posts/inline/abc.webp', 640)).toBeNull();
        expect(variantKeyOf('posts/abc.pdf', 640)).toBeNull();
        expect(variantKeyOf('posts/abc.w640.webp', 640)).toBeNull();
        expect(variantKeysOf('posts/abc.webp')).toEqual(['posts/abc.w640.webp']);
    });

    it('gives a Slide photo its own width', () => {
        expect(variantKeyOf('carousels/abc.webp', 960)).toBe('carousels/abc.w960.webp');
        expect(variantKeyOf('carousels/abc.webp', 640)).toBeNull();
        expect(variantKeysOf('departments/abc.webp')).toEqual([]);
        expect(isVariantKey('carousels/abc.w960.webp')).toBe(true);
        expect(variantBase('carousels/abc.w960.webp')).toBe('carousels/abc');
        expect(originalCandidates('carousels/abc.w960.webp')[0]).toBe('carousels/abc.webp');
    });

    it('recognises variants and finds their originals', () => {
        expect(isVariantKey('posts/abc.w640.webp')).toBe(true);
        expect(isVariantKey('posts/abc.webp')).toBe(false);
        expect(variantBase('posts/abc.w640.webp')).toBe('posts/abc');
        expect(variantBase('posts/abc.webp')).toBe('posts/abc');
        expect(originalCandidates('posts/abc.w640.webp')[0]).toBe('posts/abc.webp');
        expect(originalCandidates('posts/abc.w640.webp')).toContain('posts/abc.jpg');
    });
});
