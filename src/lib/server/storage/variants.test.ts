import { describe, expect, it } from 'vite-plus/test';
import { isVariantKey, originalCandidates, variantBase, variantKeyOf } from './variants';

describe('variant keys', () => {
    it('derives the variant of a Highlight image only', () => {
        expect(variantKeyOf('posts/abc.webp')).toBe('posts/abc.w640.webp');
        expect(variantKeyOf('posts/abc.JPG')).toBe('posts/abc.w640.webp');
        expect(variantKeyOf('posts/inline/abc.webp')).toBeNull();
        expect(variantKeyOf('carousels/abc.webp')).toBeNull();
        expect(variantKeyOf('posts/abc.pdf')).toBeNull();
        expect(variantKeyOf('posts/abc.w640.webp')).toBeNull();
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
