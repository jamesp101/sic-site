import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb(), dbProvider: 'sqlite' }));

// vi.mock is hoisted above static imports, and the modules need the mocked `./db`.
const { db } = await import('./db');
const { getDepartmentPage, getHomeData } = await import('./queries');
const { setWelcomeHero } = await import('./welcome-hero');

const site = new URL('http://localhost');
const day = (n: number) => new Date(Date.UTC(2026, 0, n));
let userId: number;
let citId: number;
let cbaId: number;

const post = (slug: string, over: Record<string, unknown>) =>
    db.post.create({ data: { title: slug, slug, type: 'article', userId, content: '', searchText: slug, ...over } });
const slide = (imagePath: string, over: Record<string, unknown>) =>
    db.carouselItem.create({ data: { imagePath, ...over } });
const hero = (title: string, over: Record<string, unknown>) =>
    db.heroSection.create({ data: { title, content: title, searchText: title, ...over } });

beforeAll(async () => {
    userId = (await db.user.create({ data: { name: 'Owner', email: 'owner@example.test' } })).id;
    citId = (await db.department.create({ data: { name: 'CIT', slug: 'cit' } })).id;
    cbaId = (await db.department.create({ data: { name: 'CBA', slug: 'cba' } })).id;

    for (let n = 1; n <= 8; n++) await post(`cit-${n}`, { departmentId: citId, createdAt: day(n) });
    await post('cba-1', { departmentId: cbaId, createdAt: day(20) });
    await post('main-1', { createdAt: day(5) });

    await slide('carousels/b.webp', { order: 2 });
    await slide('carousels/a.webp', { order: 1 });
    await slide('carousels/hidden.webp', { order: 0, showOnMain: false });
    await slide('carousels/cit-2.webp', { order: 2, departmentId: citId, showOnMain: false });
    await slide('carousels/cit-1.webp', { order: 1, departmentId: citId, showOnMain: false });

    await hero('main-second', { order: 2 });
    await hero('main-first', { order: 1 });
    await hero('main-off', { order: 0, isActive: false });
    await hero('cit-hero', { departmentId: citId });
    await hero('cba-hero', { departmentId: cbaId });

    const dean = await db.member.create({ data: { name: 'Dean', role: 'Dean', departmentId: citId } });
    await db.member.create({ data: { name: 'Staff', role: 'Staff', departmentId: citId, parentId: dean.id } });
    await db.member.create({ data: { name: 'Other', role: 'Dean', departmentId: cbaId } });
});

afterAll(closeTestDb);

describe('getHomeData', () => {
    it('reads the main Carousel, the 6 newest Posts, the active main hero sections and the Departments', async () => {
        await setWelcomeHero('Hello');
        const home = await getHomeData();

        expect(home.carousel.map((s) => s.imageUrl)).toEqual([
            '/storage/carousels/a.webp',
            '/storage/carousels/b.webp',
        ]);
        expect(home.latestPosts.map((p) => p.slug)).toEqual(['cba-1', 'cit-8', 'cit-7', 'cit-6', 'main-1', 'cit-5']);
        expect(home.heroSections.map((h) => h.title)).toEqual(['main-first', 'main-second']);
        expect(home.departments.map((d) => d.slug)).toEqual(['cba', 'cit']);
        expect(home.welcomeHero).toBe('Hello');
    });

    it('has no Welcome hero until one is saved', async () => {
        await db.setting.deleteMany();
        expect((await getHomeData()).welcomeHero).toBeNull();
    });
});

describe('getDepartmentPage', () => {
    it('is null for an unknown Department and has run no layout query for it', async () => {
        const navLinks = vi.spyOn(db.navigationLink, 'findMany');
        const departments = vi.spyOn(db.department, 'findMany');
        expect(await getDepartmentPage('nope', site)).toBeNull();
        expect(navLinks).not.toHaveBeenCalled();
        expect(departments).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it('hands over the layout queries, started once the Department was found', async () => {
        const page = await getDepartmentPage('cit', site);
        expect((await page!.departments).map((d) => d.name)).toContain('CIT');
        expect(await page!.navLinks).toEqual(expect.any(Array));
    });

    it("reads the Department's 6 newest Posts with their total, its Slides, People and hero sections", async () => {
        const page = await getDepartmentPage('cit', site);

        expect(page?.department.name).toBe('CIT');
        expect(page?.posts.map((p) => p.slug)).toEqual(['cit-8', 'cit-7', 'cit-6', 'cit-5', 'cit-4', 'cit-3']);
        expect(page?.postCount).toBe(8);
        expect(page?.carousel.map((s) => s.imageUrl)).toEqual([
            '/storage/carousels/cit-1.webp',
            '/storage/carousels/cit-2.webp',
        ]);
        expect(page?.heroSections.map((h) => h.title)).toEqual(['cit-hero']);
        expect(page?.members.map((m) => [m.name, m.children.map((c) => c.name)])).toEqual([['Dean', ['Staff']]]);
        expect(page?.seo.canonical).toBe('/departments/cit');
    });

    it('counts only its own Posts when it has fewer than 6', async () => {
        const page = await getDepartmentPage('cba', site);
        expect(page?.posts.map((p) => p.slug)).toEqual(['cba-1']);
        expect(page?.postCount).toBe(1);
    });
});
