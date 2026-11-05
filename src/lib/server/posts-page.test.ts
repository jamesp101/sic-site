import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { createBlock, createDocument, serializeDocument } from '../blocks/document';
import { excerptOf, searchTextOf } from '../blocks/content';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb(), dbProvider: 'sqlite' }));

const { db } = await import('./db');
const { getNavLinks, getPostPage, listPosts } = await import('./queries');

const long = 'Plenty of words about enrolment and orientation week. '.repeat(10);
const blockContent = serializeDocument(
    createDocument([createBlock('heading', { text: 'Welcome', level: 2 }), createBlock('paragraph', { text: long })]),
);
const markdownContent = `# Title\n\n**Bold** ${long}`;
const site = new URL('http://localhost');
let userId: number;

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const post = (slug: string, over: Record<string, unknown>) =>
    db.post.create({
        data: { title: slug, slug, type: 'article', userId, content: '', createdAt: day(1), ...over },
    });

beforeAll(async () => {
    userId = (await db.user.create({ data: { name: 'Owner', email: 'owner@example.test' } })).id;
    await db.department.createMany({
        data: [
            { id: 1, name: 'CIT', slug: 'cit' },
            { id: 2, name: 'CBA', slug: 'cba' },
        ],
    });
    await post('block', {
        content: blockContent,
        searchText: searchTextOf(blockContent),
        highlightImagePath: 'posts/abc.webp',
        createdAt: day(10),
    });
    await post('markdown', { content: markdownContent, searchText: searchTextOf(markdownContent), createdAt: day(9) });
    // Never backfilled: no searchText, so the content is read.
    await post('legacy', { content: markdownContent, searchText: '', createdAt: day(8) });
    await post('empty', { content: '', createdAt: day(7) });
});

afterAll(closeTestDb);

describe('Post Excerpts', () => {
    it('are the same as parsing the content, for block, Markdown and unindexed posts', async () => {
        const { items } = await listPosts({}, { perPage: 10 });
        const excerpt = (slug: string) => items.find((item) => item.slug === slug)?.excerpt;
        expect(excerpt('block')).toBe(excerptOf(blockContent));
        expect(excerpt('markdown')).toBe(excerptOf(markdownContent));
        expect(excerpt('legacy')).toBe(excerptOf(markdownContent));
        expect(excerpt('empty')).toBe('');
        expect(excerpt('block')?.endsWith('…')).toBe(true);
        expect(excerpt('block')?.length).toBe(200);
    });

    it('carry the card image variant of a Highlight image', async () => {
        const { items } = await listPosts({}, { perPage: 10 });
        const block = items.find((item) => item.slug === 'block');
        expect(block?.imageUrl).toBe('/storage/posts/abc.webp');
        expect(block?.imageSmallUrl).toBe('/storage/posts/abc.w640.webp');
        expect(items.find((item) => item.slug === 'markdown')?.imageSmallUrl).toBeNull();
    });

    it('stay equal on the Post page, whose Excerpt comes from the content', async () => {
        const page = await getPostPage('markdown', site);
        expect(page?.post.excerpt).toBe(excerptOf(markdownContent));
        expect(page?.related.map((item) => item.excerpt)).toContain(excerptOf(blockContent));
    });
});

describe('related Posts', () => {
    it('lists the newest of the same Department first, then the newest of the same type', async () => {
        await db.post.deleteMany();
        await post('d1', { departmentId: 1, createdAt: day(1) });
        await post('d2', { departmentId: 1, createdAt: day(2) });
        await post('t-new', { createdAt: day(9) });
        await post('t-mid', { departmentId: 2, createdAt: day(8) });
        await post('t-old', { createdAt: day(3) });
        await post('event', { type: 'event', createdAt: day(20) });
        await post('self', { departmentId: 1, createdAt: day(5) });

        const slugs = async (slug: string) => (await getPostPage(slug, site))?.related.map((item) => item.slug);
        expect(await slugs('self')).toEqual(['d2', 'd1', 't-new']);
        expect(await slugs('t-old')).toEqual(['t-new', 't-mid', 'self']);
        expect(await slugs('event')).toEqual([]);
    });
});

describe('getNavLinks', () => {
    it('nests active children under active top-level links in order', async () => {
        const top = (label: string, order: number, isActive = true) =>
            db.navigationLink.create({ data: { label, url: `/${label}`, order, isActive } });
        const child = (label: string, order: number, parentId: number, isActive = true) =>
            db.navigationLink.create({ data: { label, url: `/${label}`, order, isActive, parentId } });
        const b = await top('b', 2);
        await top('a', 1);
        const hidden = await top('hidden', 3, false);
        await child('b2', 2, b.id);
        await child('b1', 1, b.id);
        await child('b-off', 3, b.id, false);
        await child('orphan', 1, hidden.id);

        const links = await getNavLinks();
        expect(links.map((link) => [link.label, link.children.map((c) => c.label)])).toEqual([
            ['a', []],
            ['b', ['b1', 'b2']],
        ]);
    });
});
