import { describe, expect, it } from 'vite-plus/test';
import { parsePage } from './pagination';
import {
    downloadsHref,
    hasDownloadFilters,
    hasPostFilters,
    parseDepartmentId,
    parseDownloadFilters,
    parsePostFilters,
    parseSearch,
    postsHref,
} from './post-filters';

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

describe('download filters', () => {
    const parseDownloads = (query: string) => parseDownloadFilters(new URLSearchParams(query));

    it('defaults to no filters and drops malformed values', () => {
        expect(parseDownloads('')).toEqual({ search: undefined, departmentId: undefined, directory: undefined });
        expect(hasDownloadFilters(parseDownloads('department_id=0&search=%20&directory=%20'))).toBe(false);
    });

    it('round-trips search, Department and Directory through downloadsHref', () => {
        const filters = { search: 'enrol & more', departmentId: 7, directory: 'Forms / 2026' };
        const url = new URL(downloadsHref(filters), 'https://example.test');
        expect(url.pathname).toBe('/downloads');
        expect(parseDownloads(url.search)).toEqual(filters);
        expect(hasDownloadFilters(filters)).toBe(true);
        expect(downloadsHref({})).toBe('/downloads');
    });
});
