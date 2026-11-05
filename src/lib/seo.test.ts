import { describe, expect, it } from 'vite-plus/test';
import type { DepartmentDetail, PostDetail } from './content-types';
import {
    META_DESCRIPTION_MAX,
    absoluteUrl,
    canonicalHref,
    departmentPageSeo,
    metaDescription,
    postPageSeo,
    postsListSeo,
    siteUrl,
} from './seo';

const site = new URL('https://sic.example');

const post = (over: Partial<PostDetail> = {}): PostDetail => ({
    id: 1,
    title: 'Foundation Day',
    slug: 'foundation-day',
    type: 'article',
    excerpt: 'A day to remember.',
    imageUrl: '/storage/a.webp',
    imageSmallUrl: null,
    startDate: null,
    endDate: null,
    isFeatured: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    department: null,
    html: '<p>x</p>',
    authorName: 'Admin',
    ...over,
});

const department = (over: Partial<DepartmentDetail> = {}): DepartmentDetail => ({
    id: 2,
    name: 'Grade School',
    slug: 'grade-school',
    description: null,
    logoUrl: null,
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    heroContent: null,
    ...over,
});

describe('siteUrl', () => {
    it('prefers the configured site and falls back to the request origin', () => {
        expect(siteUrl({ site, url: new URL('http://localhost:4321/x') }).href).toBe('https://sic.example/');
        expect(siteUrl({ url: new URL('http://localhost:4321/x?y=1') }).href).toBe('http://localhost:4321/');
    });
});

describe('canonicalHref', () => {
    it('is absolute and query-free by default, explicit when given', () => {
        const context = { site, url: new URL('https://sic.example/posts?type=event&page=2') };
        expect(canonicalHref(undefined, context)).toBe('https://sic.example/posts');
        expect(canonicalHref('/posts?page=2', context)).toBe('https://sic.example/posts?page=2');
        expect(canonicalHref('https://other.example/a', context)).toBe('https://other.example/a');
    });
});

describe('metaDescription', () => {
    it('collapses whitespace and clamps once at the limit', () => {
        expect(metaDescription('  one \n\n two  ')).toBe('one two');
        expect(metaDescription(null)).toBe('');
        const long = metaDescription('word '.repeat(100));
        expect(long.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
        expect(long.endsWith('…')).toBe(true);
        expect(metaDescription('x'.repeat(META_DESCRIPTION_MAX))).toHaveLength(META_DESCRIPTION_MAX);
    });
});

describe('page SEO', () => {
    it('post: canonical path, absolute JSON-LD url, title fallback for the description', () => {
        const seo = postPageSeo(post(), site);
        expect(seo).toMatchObject({
            title: 'Foundation Day',
            description: 'A day to remember.',
            canonical: '/posts/foundation-day',
            type: 'article',
            image: '/storage/a.webp',
        });
        expect(seo.jsonLd).toMatchObject({ mainEntityOfPage: { '@id': absoluteUrl('/posts/foundation-day', site) } });
        expect(seo.breadcrumbs?.at(-1)).toEqual({ label: 'Foundation Day' });
        expect(postPageSeo(post({ excerpt: '' }), site).description).toBe('Foundation Day');
    });

    it('department: description fallback and image precedence', () => {
        const fallback = 'Grade School at San Isidro College, Malaybalay City, Bukidnon.';
        expect(departmentPageSeo(department(), [], null, site).description).toBe(fallback);
        expect(departmentPageSeo(department({ description: '   ' }), [], null, site).description).toBe(fallback);
        expect(departmentPageSeo(department({ description: 'Teaching.' }), [], null, site).description).toBe(
            'Teaching.',
        );
        expect(departmentPageSeo(department({ logoUrl: '/logo.webp' }), [], '/slide.webp', site).image).toBe(
            '/logo.webp',
        );
        expect(departmentPageSeo(department(), [], '/slide.webp', site).image).toBe('/slide.webp');
    });

    it('posts list: filtered views are noindex, canonical keeps only the page', () => {
        const base = postsListSeo([], { sort: 'newest' }, 1, site);
        expect(base).toMatchObject({ canonical: '/posts', noindex: false, title: 'News, Events & Announcements' });
        const filtered = postsListSeo([], { type: 'event', sort: 'newest' }, 3, site);
        expect(filtered).toMatchObject({ canonical: '/posts?page=3', noindex: true, follow: true });
        expect(filtered.title).toBe('News, Events & Announcements (page 3)');
    });
});
