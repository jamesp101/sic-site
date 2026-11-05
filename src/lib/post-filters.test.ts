import { describe, expect, it } from 'vite-plus/test';
import { parsePage } from './pagination';
import { hasPostFilters, parseDepartmentId, parsePostFilters, parseSearch, postsHref } from './post-filters';

const parse = (query: string) => parsePostFilters(new URLSearchParams(query));

describe('parseDepartmentId', () => {
    it('accepts positive integers only', () => {
        expect(parseDepartmentId('4')).toBe(4);
        for (const value of [null, '', '0', '-1', '1.5', 'abc'])
            expect(parseDepartmentId(value), String(value)).toBeUndefined();
    });
});

describe('parseSearch', () => {
    it('trims and caps the value', () => {
        expect(parseSearch('  hello ')).toBe('hello');
        expect(parseSearch(null)).toBe('');
        expect(parseSearch('x'.repeat(300))).toHaveLength(100);
    });
});

describe('parsePostFilters', () => {
    it('defaults to no filters, newest first', () => {
        expect(parse('')).toEqual({ type: undefined, departmentId: undefined, search: undefined, sort: 'newest' });
        expect(hasPostFilters(parse(''))).toBe(false);
    });

    it('reads every filter and drops malformed values', () => {
        expect(parse('type=event&department_id=3&search=%20mass%20&sort=oldest')).toEqual({
            type: 'event',
            departmentId: 3,
            search: 'mass',
            sort: 'oldest',
        });
        expect(parse('type=bogus&department_id=-2&sort=sideways')).toEqual({
            type: undefined,
            departmentId: undefined,
            search: undefined,
            sort: 'newest',
        });
    });
});

describe('postsHref', () => {
    it('leaves defaults out of the URL', () => {
        expect(postsHref({})).toBe('/posts');
        expect(postsHref({ sort: 'newest' }, 1)).toBe('/posts');
        expect(postsHref({}, 3)).toBe('/posts?page=3');
    });

    it('round-trips filters and page through parsePostFilters and parsePage', () => {
        const filters = { type: 'announcement', departmentId: 7, search: 'enrol & more', sort: 'oldest' } as const;
        const url = new URL(postsHref(filters, 4), 'https://example.test');
        expect(url.pathname).toBe('/posts');
        expect(parsePostFilters(url.searchParams)).toEqual(filters);
        expect(parsePage(url.searchParams.get('page'))).toBe(4);
        expect(postsHref(parsePostFilters(url.searchParams), parsePage(url.searchParams.get('page')))).toBe(
            `${url.pathname}${url.search}`,
        );
    });
});
