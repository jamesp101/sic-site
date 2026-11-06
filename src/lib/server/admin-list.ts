/**
 * The one query behind every paginated admin list. Free of `astro:*` imports so it is unit-testable.
 * A page declares its sortable fields once (`ListSpec`) and calls `runList` with the request URL; it gets
 * back the rows of one page, the totals, and the sort/page links, and never builds an `orderBy`, a `where`
 * restriction or a link itself. The actor's Admin scope always applies (`listWhere`), whatever the
 * search, filters, sort or page say.
 */
import { parsePage } from '@/lib/pagination';
import type { Actor } from './authz';
import { listWhere, type AdminScope } from './admin-scope';
import { textContains } from './search';

export type SortDir = 'asc' | 'desc';

export interface SortableField<O> {
    /** Prisma ordering for this field. */
    orderBy(dir: SortDir): O;
    /** Direction used when the list is first sorted by this field. */
    defaultDir: SortDir;
}

export interface ListSpec<O> {
    /** Sortable fields by the `?sort=` value; anything else falls back to `defaultSort`. */
    fields: Record<string, SortableField<O>>;
    defaultSort: string;
    /** Always ordered last, so rows with equal sort values keep a stable order across pages. */
    tiebreak: O;
    /** Model fields a `?q=` search matches (substring, any of them). */
    search?: readonly string[];
    perPage?: number;
}

/** The part of a list state a sortable column header needs. */
export interface SortLinks {
    /** Link that sorts by `field` (toggles the direction when it is the current sort); resets to page 1. */
    sortHref(field: string): string;
    /** `aria-sort` value of `field`'s header; undefined when the list is not sorted by it. */
    ariaSort(field: string): 'ascending' | 'descending' | undefined;
}

export interface ListState<Row> extends SortLinks {
    rows: Row[];
    total: number;
    /** 1-based; an out-of-range request shows the last page. */
    page: number;
    pageCount: number;
    perPage: number;
    /** Trimmed `?q=` ('' when absent). */
    q: string;
    /** A search or a filter narrows the list (sort, direction and page do not count). */
    filtered: boolean;
    /** The list without search, filters and page; sort and direction stay, so a reset does not reorder it. */
    resetHref: string;
    sort: string;
    dir: SortDir;
    /** Link to `page` keeping the other parameters; page 1 is left out of the URL. */
    pageHref(page: number): string;
    /** Same list with `changes` applied to its parameters (`null` removes one); back on page 1 unless `page` is set. */
    href(changes: Record<string, string | null>): string;
}

export const LIST_PER_PAGE = 25;

/** A field sorted by one Prisma path/column; `defaultDir` defaults to ascending. */
export function sortBy<O>(orderBy: (dir: SortDir) => O, defaultDir: SortDir = 'asc'): SortableField<O> {
    return { orderBy, defaultDir };
}

/** The assembled `where`: the restriction first, then search and filters, all ANDed. */
export type ListWhere<W extends object> = { AND: W[] };

export interface RunListInput<W extends object, O, Row> {
    url: URL;
    actor: Actor;
    scope: AdminScope;
    spec: ListSpec<O>;
    /** Extra conditions (type, flags…); empty ones are skipped. */
    filters?: readonly (W | '' | null | undefined | false)[];
    /**
     * Replaces the Admin scope for lists that are not department-owned rows (the departments list itself
     * is restricted by `id`, the users list is superadmin-only). It is still ANDed, so search cannot widen it.
     */
    restriction?: W;
    /** Query parameters the `filters` are read from; a reset drops them with `q` and `page`. */
    filterParams?: readonly string[];
    count: (where: ListWhere<W>) => Promise<number>;
    fetch: (args: { where: ListWhere<W>; orderBy: O[]; skip: number; take: number }) => Promise<Row[]>;
}

export async function runList<W extends object, O, Row>(input: RunListInput<W, O, Row>): Promise<ListState<Row>> {
    const { url, actor, scope, spec, filters = [], restriction, filterParams = [], count, fetch } = input;
    const params = url.searchParams;
    const perPage = spec.perPage ?? LIST_PER_PAGE;

    const q = params.get('q')?.trim() ?? '';
    const requested = params.get('sort') ?? '';
    const sort = Object.hasOwn(spec.fields, requested) ? requested : spec.defaultSort;
    const field = spec.fields[sort];
    const requestedDir = params.get('dir');
    const dir: SortDir = requestedDir === 'asc' || requestedDir === 'desc' ? requestedDir : field.defaultDir;

    const active = (f: unknown) => !!f && Object.keys(f).length > 0;
    const searchFilter =
        q && spec.search?.length
            ? ({ OR: spec.search.map((name) => ({ [name]: textContains(q) })) } as unknown as W)
            : null;
    const all = [searchFilter, ...filters];
    // `listWhere` yields a `departmentId` condition: lists using it are models with that column, so it is a W.
    const where: ListWhere<W> = restriction
        ? { AND: [restriction, ...all.filter((f): f is W => active(f))] }
        : (listWhere<W>(actor, scope, all) as ListWhere<W>);

    const filtered = q !== '' || filters.some(active);
    const total = await count(where);
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    // Past the end (e.g. after deleting the last row of the last page): show the last page instead.
    const page = Math.min(parsePage(params.get('page')), pageCount);
    const rows = await fetch({
        where,
        orderBy: [field.orderBy(dir), spec.tiebreak],
        skip: (page - 1) * perPage,
        take: perPage,
    });

    const hrefWith = (changes: Record<string, string | null>) => {
        const next = new URL(url);
        if (!('page' in changes)) next.searchParams.delete('page');
        for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.searchParams.delete(key);
            else next.searchParams.set(key, value);
        }
        return `${next.pathname}${next.search}`;
    };
    return {
        rows,
        total,
        page,
        pageCount,
        perPage,
        q,
        filtered,
        resetHref: hrefWith({ q: null, page: null, ...Object.fromEntries(filterParams.map((n) => [n, null])) }),
        sort,
        dir,
        href: hrefWith,
        pageHref: (target) => hrefWith({ page: target > 1 ? String(target) : null }),
        sortHref(name) {
            const next = sort === name ? (dir === 'asc' ? 'desc' : 'asc') : spec.fields[name].defaultDir;
            return hrefWith({ sort: name, dir: next });
        },
        ariaSort: (name) => (sort === name ? (dir === 'asc' ? 'ascending' : 'descending') : undefined),
    };
}
