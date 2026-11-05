/**
 * Query-string rules shared by the public listings (`/posts`, `/downloads`): what a filter value may be,
 * and the listing URL for a set of filters. Pure, no `astro:*`.
 */
import { POST_TYPES, type DownloadFilters, type PostFilters, type PostType } from './content-types';

const SEARCH_MAX = 100;
const DIRECTORY_MAX = 255;

/** A `department_id` value: a positive integer, otherwise no filter. */
export function parseDepartmentId(value: string | null): number | undefined {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** A `search` value: trimmed and capped, `''` when absent. */
export function parseSearch(value: string | null): string {
    return value?.trim().slice(0, SEARCH_MAX) ?? '';
}

/** The filters of a `/posts` request; unknown or malformed values are dropped, `sort` always resolves. */
export function parsePostFilters(params: URLSearchParams): PostFilters & { sort: NonNullable<PostFilters['sort']> } {
    const type = params.get('type');
    return {
        type: POST_TYPES.includes(type as PostType) ? (type as PostType) : undefined,
        departmentId: parseDepartmentId(params.get('department_id')),
        search: parseSearch(params.get('search')) || undefined,
        sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    };
}

/** Whether `filters` narrow or reorder the default list. */
export function hasPostFilters(filters: PostFilters): boolean {
    return Boolean(filters.type || filters.departmentId || filters.search || filters.sort === 'oldest');
}

/** `/posts` URL for `filters` on `page` (1-based); default values stay out of the query string. */
export function postsHref(filters: PostFilters, page = 1): string {
    const query = new URLSearchParams();
    if (filters.type) query.set('type', filters.type);
    if (filters.departmentId) query.set('department_id', String(filters.departmentId));
    if (filters.search) query.set('search', filters.search);
    if (filters.sort === 'oldest') query.set('sort', 'oldest');
    if (page > 1) query.set('page', String(page));
    const text = query.toString();
    return text ? `/posts?${text}` : '/posts';
}

/** The filters of a `/downloads` request; malformed values are dropped. */
export function parseDownloadFilters(params: URLSearchParams): DownloadFilters {
    return {
        search: parseSearch(params.get('search')) || undefined,
        departmentId: parseDepartmentId(params.get('department_id')),
        directory: params.get('directory')?.trim().slice(0, DIRECTORY_MAX) || undefined,
    };
}

/** Whether `filters` narrow the default `/downloads` list. */
export function hasDownloadFilters(filters: DownloadFilters): boolean {
    return Boolean(filters.search || filters.departmentId || filters.directory);
}

/** `/downloads` URL for `filters`; default values stay out of the query string. */
export function downloadsHref(filters: DownloadFilters): string {
    const query = new URLSearchParams();
    if (filters.search) query.set('search', filters.search);
    if (filters.departmentId) query.set('department_id', String(filters.departmentId));
    if (filters.directory) query.set('directory', filters.directory);
    const text = query.toString();
    return text ? `/downloads?${text}` : '/downloads';
}
