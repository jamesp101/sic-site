import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import type { Prisma } from '@/generated/prisma/client';
import { closeTestDb } from './test-db';

// `vi.mock` is hoisted above the imports, so the factory loads the harness itself.
vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb(), dbProvider: 'sqlite' }));

const { db } = await import('./db');
const { runList, sortBy } = await import('./admin-list');

const admin = { id: 1, role: 'superadmin', departmentId: null };
const cit = { id: 2, role: 'department_user', departmentId: 10 };
const all = { kind: 'all' } as const;

const spec = {
    fields: {
        title: sortBy<Prisma.PostOrderByWithRelationInput>((dir) => ({ title: dir })),
        created: sortBy<Prisma.PostOrderByWithRelationInput>((dir) => ({ createdAt: dir }), 'desc'),
    },
    defaultSort: 'created',
    tiebreak: { id: 'desc' } as Prisma.PostOrderByWithRelationInput,
    search: ['title', 'searchText'],
    perPage: 4,
};

function list(
    actor: typeof admin | typeof cit,
    query = '',
    scope: Parameters<typeof runList>[0]['scope'] = all,
    filtering: { filters?: Prisma.PostWhereInput[]; filterParams?: string[] } = {},
) {
    return runList<Prisma.PostWhereInput, Prisma.PostOrderByWithRelationInput, { id: number; title: string }>({
        url: new URL(`http://localhost/admin/posts${query}`),
        actor,
        scope,
        spec,
        ...filtering,
        count: (where) => db.post.count({ where }),
        fetch: (args) => db.post.findMany({ ...args, select: { id: true, title: true } }),
    });
}

beforeAll(async () => {
    await db.department.createMany({
        data: [
            { id: 10, name: 'CIT', slug: 'cit' },
            { id: 11, name: 'CBA', slug: 'cba' },
        ],
    });
    const user = await db.user.create({ data: { name: 'Owner', email: 'owner@example.test' } });
    // CIT: "Alpha 1".."Alpha 6" (6 rows); CBA: "Alpha 7".."Alpha 8" and "Beta 9"; general: "Alpha 10".
    const rows = [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({ title: `Alpha ${n}`, departmentId: 10 })),
        ...[7, 8].map((n) => ({ title: `Alpha ${n}`, departmentId: 11 })),
        { title: 'Beta 9', departmentId: 11 },
        { title: 'Alpha 10', departmentId: null },
    ];
    for (const [index, row] of rows.entries()) {
        await db.post.create({
            data: {
                ...row,
                slug: `p-${index}`,
                content: '',
                searchText: '',
                type: 'article',
                userId: user.id,
                createdAt: new Date(2026, 0, index + 1),
            },
        });
    }
});
afterAll(closeTestDb);

describe('runList', () => {
    it('keeps a department user inside their department through search, sort and page', async () => {
        for (const query of [
            '',
            '?q=Alpha',
            '?q=Beta',
            '?sort=title&dir=desc',
            '?page=2',
            '?q=Alpha&sort=title&page=2',
        ]) {
            const state = await list(cit, query, { kind: 'department', id: 11, name: 'CBA', slug: 'cba' });
            expect(state.total, query).toBe(query.includes('Beta') ? 0 : 6);
            const titles = new Set<string>();
            for (let page = 1; page <= state.pageCount; page++) {
                const paged = await list(cit, `${query}${query ? '&' : '?'}page=${page}`);
                for (const row of paged.rows) titles.add(row.title);
            }
            // Only CIT's own "Alpha 1".."Alpha 6" ever appear, whatever scope or search is asked for.
            for (const title of titles) expect(Number(title.split(' ')[1]), `${query} ${title}`).toBeLessThanOrEqual(6);
        }
    });

    it('lets a superadmin narrow by scope and search together', async () => {
        const main = await list(admin, '?q=Alpha', { kind: 'main' });
        expect(main.rows.map((r) => r.title)).toEqual(['Alpha 10']);
        const cba = await list(admin, '?q=Alpha', { kind: 'department', id: 11, name: 'CBA', slug: 'cba' });
        expect(cba.total).toBe(2);
    });

    it('sorts only by allow-listed fields and falls back to the default sort', async () => {
        expect((await list(admin, '?sort=title&dir=asc')).sort).toBe('title');
        for (const bad of ['userId', 'constructor', '__proto__', 'id', '']) {
            const state = await list(admin, `?sort=${bad}`);
            expect(state.sort).toBe('created');
            expect(state.dir).toBe('desc');
            expect(state.rows[0].title).toBe('Alpha 10');
        }
        // An invalid direction falls back to the field's default.
        expect((await list(admin, '?sort=title&dir=sideways')).dir).toBe('asc');
    });

    it('shows the last page for an out-of-range page and pages without overlap', async () => {
        const first = await list(admin);
        expect([first.total, first.pageCount, first.page]).toEqual([10, 3, 1]);
        const last = await list(admin, '?page=99');
        expect(last.page).toBe(3);
        expect(last.rows).toHaveLength(2);
        const seen = new Set<number>();
        for (const page of [1, 2, 3]) for (const row of (await list(admin, `?page=${page}`)).rows) seen.add(row.id);
        expect(seen.size).toBe(10);
        const empty = await list(admin, '?q=nothing-matches&page=5');
        expect([empty.total, empty.pageCount, empty.page, empty.rows]).toEqual([0, 1, 1, []]);
    });

    it('builds sort and page links that keep the other parameters', async () => {
        const state = await list(admin, '?q=Alpha&page=2');
        expect(state.sortHref('title')).toBe('/admin/posts?q=Alpha&sort=title&dir=asc');
        expect(state.sortHref('created')).toBe('/admin/posts?q=Alpha&sort=created&dir=asc');
        expect(state.ariaSort('created')).toBe('descending');
        expect(state.ariaSort('title')).toBeUndefined();
        expect(state.pageHref(1)).toBe('/admin/posts?q=Alpha');
        expect(state.pageHref(3)).toBe('/admin/posts?q=Alpha&page=3');
        const sorted = await list(admin, '?sort=title&dir=asc');
        expect(sorted.sortHref('title')).toBe('/admin/posts?sort=title&dir=desc');
    });

    it('reports whether a search or a declared filter narrows the list; sort, direction and page do not', async () => {
        const params = ['type', 'featured'];
        const run = (query: string, filters: Prisma.PostWhereInput[] = []) =>
            list(admin, query, all, { filters, filterParams: params });
        expect((await run('')).filtered).toBe(false);
        expect((await run('?sort=title&dir=asc&page=2')).filtered).toBe(false);
        expect((await run('?q=Alpha')).filtered).toBe(true);
        expect((await run('?q=%20%20')).filtered).toBe(false);
        expect((await run('?type=article', [{ type: 'article' }])).filtered).toBe(true);
        // An absent filter (the page passes `false`/`''`/null for it) does not count.
        const absent = await list(admin, '', all, { filters: [false, '', null] as never, filterParams: params });
        expect(absent.filtered).toBe(false);
    });

    it('resets to the bare list, keeping only the sort and direction', async () => {
        const state = await list(admin, '?q=Alpha&type=article&featured=yes&page=2&sort=title&dir=desc&other=1', all, {
            filterParams: ['type', 'featured'],
        });
        expect(state.resetHref).toBe('/admin/posts?sort=title&dir=desc&other=1');
        expect((await list(admin, '?q=Alpha&page=2')).resetHref).toBe('/admin/posts');
    });

    it('reports filtered for a list with its own restriction too', async () => {
        const restricted = (query: string) =>
            runList<Prisma.PostWhereInput, Prisma.PostOrderByWithRelationInput, { id: number }>({
                url: new URL(`http://localhost/admin/posts${query}`),
                actor: admin,
                scope: all,
                spec,
                restriction: {},
                count: (where) => db.post.count({ where }),
                fetch: (args) => db.post.findMany({ ...args, select: { id: true } }),
            });
        expect((await restricted('')).filtered).toBe(false);
        expect((await restricted('?q=Beta')).filtered).toBe(true);
    });
});
