import { describe, expect, it } from 'vite-plus/test';
import {
    isVariantKey,
    originalCandidates,
    THUMB_WIDTH,
    variantBase,
    variantKeyOf,
    variantKeysOf,
    variantWidths,
} from './variants';

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
        expect(variantKeysOf('downloads/abc.webp')).toEqual([]);
        expect(isVariantKey('carousels/abc.w960.webp')).toBe(true);
        expect(variantBase('carousels/abc.w960.webp')).toBe('carousels/abc');
        expect(originalCandidates('carousels/abc.w960.webp')[0]).toBe('carousels/abc.webp');
    });

    it('gives Department logos and Member portraits a 128 px variant, and nothing else under those prefixes', () => {
        expect(THUMB_WIDTH).toBe(128);
        expect(variantKeyOf('departments/abc.webp', 128)).toBe('departments/abc.w128.webp');
        expect(variantKeyOf('members/abc.PNG', 128)).toBe('members/abc.w128.webp');
        expect(variantKeyOf('members/abc.webp', 640)).toBeNull();
        expect(variantKeyOf('members/nested/abc.webp', 128)).toBeNull();
        expect(variantWidths('members/abc.w128.webp')).toEqual([]);
        expect(isVariantKey('departments/abc.w128.webp')).toBe(true);
        expect(variantBase('members/abc.w128.webp')).toBe('members/abc');
        expect(originalCandidates('members/abc.w128.webp')[0]).toBe('members/abc.webp');
    });

    it('looks for an original only behind a variant its kind has, and tries a bounded number of keys', () => {
        expect(originalCandidates('downloads/abc.w640.webp')).toEqual([]);
        expect(originalCandidates('posts/inline/abc.w640.webp')).toEqual([]);
        expect(originalCandidates('posts/abc.w960.webp')).toEqual([]);
        expect(originalCandidates('carousels/abc.w128.webp')).toEqual([]);
        expect(originalCandidates('posts/abc.webp')).toEqual([]);
        expect(originalCandidates('../posts/abc.w640.webp')).toEqual([]);
        const candidates = originalCandidates('posts/abc.w640.webp');
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.length).toBeLessThanOrEqual(4);
        expect(candidates.slice(0, 2)).toEqual(['posts/abc.webp', 'posts/abc.jpg']);
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
