import { describe, expect, it } from 'vite-plus/test';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
    it('lower-cases and joins words with dashes', () => {
        expect(slugify('Enrollment Details 2026')).toBe('enrollment-details-2026');
    });

    it('collapses punctuation, underscores and repeated separators', () => {
        expect(slugify('  Hello,   World!! _ again ')).toBe('hello-world-again');
    });

    it('strips accents', () => {
        expect(slugify('Café Señor')).toBe('cafe-senor');
    });

    it('returns an empty string when nothing usable remains', () => {
        expect(slugify('!!! ???')).toBe('');
    });
});

describe('uniqueSlug', () => {
    const existsIn = (taken: string[]) => async (slug: string) => taken.includes(slug);

    it('returns the base slug when free', async () => {
        expect(await uniqueSlug('My Post', existsIn([]))).toBe('my-post');
    });

    it('appends -1, -2, … until free', async () => {
        expect(await uniqueSlug('My Post', existsIn(['my-post']))).toBe('my-post-1');
        expect(await uniqueSlug('My Post', existsIn(['my-post', 'my-post-1', 'my-post-2']))).toBe('my-post-3');
    });

    it('falls back to "post" for empty slugs, and to a custom fallback', async () => {
        expect(await uniqueSlug('???', existsIn([]))).toBe('post');
        expect(await uniqueSlug('???', existsIn(['post']))).toBe('post-1');
        expect(await uniqueSlug('???', existsIn([]), 'department')).toBe('department');
    });
});
