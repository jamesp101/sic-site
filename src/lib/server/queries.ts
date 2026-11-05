import type { Prisma } from '@/generated/prisma/client';
import type {
    CarouselSlide,
    DepartmentDetail,
    DepartmentSummary,
    HeroSectionView,
    MemberNode,
    NavLinkView,
    Paginated,
    PostDetail,
    PostFilters,
    PostSummary,
    PostType,
} from '@/lib/content-types';
import { clampExcerpt, excerptOf, parseContent } from '@/lib/blocks/content';
import { buildOrgTree, type OrgNode } from '@/lib/org-tree';
import { departmentPageSeo, postPageSeo, postsListSeo, type PageSeo } from '@/lib/seo';
import { db } from './db';
import { findSlides } from './slides';
import { textContains } from './search';
import { publicUrl, variantUrl } from './storage';
import { CARD_WIDTH, THUMB_WIDTH } from './storage/variants';
import { getWelcomeHero } from './welcome-hero';

const DEPARTMENT_PAGE_POSTS = 6;

const departmentRefSelect = { id: true, name: true, slug: true } as const;

const postSelect = {
    id: true,
    title: true,
    slug: true,
    type: true,
    searchText: true,
    highlightImagePath: true,
    startDate: true,
    endDate: true,
    isFeatured: true,
    createdAt: true,
    updatedAt: true,
    department: { select: departmentRefSelect },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

/**
 * Summaries for post cards and lists. The Excerpt is the clamped `searchText` (the plain text of the content, kept
 * by every writer), so the content is not parsed; only rows whose `searchText` is empty (never backfilled, or no
 * text at all) load their content and take `excerptOf(content)`.
 */
async function toPostSummaries(rows: PostRow[]): Promise<PostSummary[]> {
    const blankIds = rows.filter((row) => !row.searchText).map((row) => row.id);
    const contents = new Map<number, string>();
    if (blankIds.length > 0) {
        const found = await db.post.findMany({ where: { id: { in: blankIds } }, select: { id: true, content: true } });
        for (const { id, content } of found) contents.set(id, content);
    }
    return rows.map((row) =>
        summaryWithExcerpt(row, row.searchText ? clampExcerpt(row.searchText) : excerptOf(contents.get(row.id))),
    );
}

function summaryWithExcerpt(row: PostRow, excerpt: string): PostSummary {
    return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type as PostType,
        excerpt,
        imageUrl: publicUrl(row.highlightImagePath),
        imageSmallUrl: variantUrl(row.highlightImagePath, CARD_WIDTH),
        startDate: row.startDate,
        endDate: row.endDate,
        isFeatured: row.isFeatured,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        department: row.department,
    };
}

const departmentSelect = {
    id: true,
    name: true,
    slug: true,
    description: true,
    logoPath: true,
    updatedAt: true,
} satisfies Prisma.DepartmentSelect;

type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;

function toDepartmentSummary(row: DepartmentRow): DepartmentSummary {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        logoUrl: publicUrl(row.logoPath),
        logoSmallUrl: variantUrl(row.logoPath, THUMB_WIDTH),
        updatedAt: row.updatedAt,
    };
}

function heroSections(departmentId: number | null): Promise<HeroSectionView[]> {
    return db.heroSection.findMany({
        where: { departmentId, isActive: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, content: true },
    });
}

/**
 * Starts a query the layout needs (`getNavLinks()`, `getDepartments()`) before the page's own queries, so they run
 * side by side instead of one after the other. A page that returns early (404, redirect) never awaits it, so the
 * promise is marked handled: a failing query then cannot become an unhandled rejection.
 */
export function startQuery<T>(query: Promise<T>): Promise<T> {
    query.catch(() => {});
    return query;
}

/** Active Navigation links with their active children: one flat query, nested in memory. */
export async function getNavLinks(): Promise<NavLinkView[]> {
    const rows = await db.navigationLink.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, label: true, url: true, parentId: true },
    });
    const roots: NavLinkView[] = [];
    const byId = new Map<number, NavLinkView>();
    for (const { id, label, url, parentId } of rows) {
        const link: NavLinkView = { id, label, url, children: [] };
        if (parentId === null) {
            roots.push(link);
            byId.set(id, link);
        }
    }
    for (const { id, label, url, parentId } of rows) {
        if (parentId !== null) byId.get(parentId)?.children.push({ id, label, url, children: [] });
    }
    return roots;
}

export async function getDepartments(): Promise<DepartmentSummary[]> {
    const rows = await db.department.findMany({ orderBy: { name: 'asc' }, select: departmentSelect });
    return rows.map(toDepartmentSummary);
}

/** Every Department's name and slug, by name: what the Departments menu and the admin's link suggestions list. */
export function getNavDepartments(): Promise<{ name: string; slug: string }[]> {
    return db.department.findMany({ orderBy: { name: 'asc' }, select: { name: true, slug: true } });
}

export async function getHomeData(): Promise<{
    carousel: CarouselSlide[];
    departments: DepartmentSummary[];
    latestPosts: PostSummary[];
    welcomeHero: string | null;
    heroSections: HeroSectionView[];
}> {
    const [carousel, departments, latestPosts, welcomeHero, heroes] = await Promise.all([
        findSlides({ showOnMain: true }),
        getDepartments(),
        db.post.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: postSelect }),
        getWelcomeHero(),
        heroSections(null),
    ]);
    return {
        carousel,
        departments,
        latestPosts: await toPostSummaries(latestPosts),
        welcomeHero,
        heroSections: heroes,
    };
}

/** A Department's page: its Slides, People, hero sections and its 6 newest Posts, with the total for "View all". */
export async function getDepartmentPage(
    slug: string,
    site: URL,
): Promise<{
    department: DepartmentDetail;
    carousel: CarouselSlide[];
    posts: PostSummary[];
    postCount: number;
    members: MemberNode[];
    heroSections: HeroSectionView[];
    seo: PageSeo;
} | null> {
    const row = await db.department.findUnique({
        where: { slug },
        select: { ...departmentSelect, heroContent: true },
    });
    if (!row) return null;

    const [carousel, posts, postCount, memberRows, heroes] = await Promise.all([
        findSlides({ departmentId: row.id }),
        db.post.findMany({
            where: { departmentId: row.id },
            orderBy: { createdAt: 'desc' },
            take: DEPARTMENT_PAGE_POSTS,
            select: postSelect,
        }),
        db.post.count({ where: { departmentId: row.id } }),
        db.member.findMany({
            where: { departmentId: row.id },
            select: { id: true, name: true, role: true, imagePath: true, parentId: true, order: true },
        }),
        heroSections(row.id),
    ]);

    const toNode = ({ member, children }: OrgNode<(typeof memberRows)[number]>): MemberNode => ({
        id: member.id,
        name: member.name,
        role: member.role,
        imageUrl: publicUrl(member.imagePath),
        imageSmallUrl: variantUrl(member.imagePath, THUMB_WIDTH),
        children: children.map(toNode),
    });
    const members = buildOrgTree(memberRows).map(toNode);
    const department: DepartmentDetail = { ...toDepartmentSummary(row), heroContent: row.heroContent };

    return {
        department,
        carousel,
        posts: await toPostSummaries(posts),
        postCount,
        members,
        heroSections: heroes,
        seo: departmentPageSeo(department, members, carousel[0]?.imageUrl, site),
    };
}

/** Posts matching `filters`, newest (or oldest) first, one page at a time. */
export async function listPosts(
    filters: PostFilters,
    { page = 1, perPage }: { page?: number; perPage: number },
): Promise<Paginated<PostSummary>> {
    const where: Prisma.PostWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    const search = filters.search?.trim();
    if (search) where.OR = [{ title: textContains(search) }, { searchText: textContains(search) }];

    const [total, rows] = await Promise.all([
        db.post.count({ where }),
        db.post.findMany({
            where,
            orderBy: [{ createdAt: filters.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'desc' }],
            skip: (page - 1) * perPage,
            take: perPage,
            select: postSelect,
        }),
    ]);
    return {
        items: await toPostSummaries(rows),
        total,
        page,
        perPage,
        pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
}

/** One page of the public `/posts` list with the departments for its filter bar; `null` when `page` is past the end. */
export async function getPostsPage(
    filters: PostFilters,
    page: number,
    perPage: number,
    site: URL,
): Promise<{ result: Paginated<PostSummary>; departments: DepartmentSummary[]; seo: PageSeo } | null> {
    const [departments, result] = await Promise.all([getDepartments(), listPosts(filters, { page, perPage })]);
    if (page > result.pageCount) return null;
    return { result, departments, seo: postsListSeo(result.items, filters, page, site) };
}

export async function getPostPage(
    slug: string,
    site: URL,
): Promise<{ post: PostDetail; related: PostSummary[]; seo: PageSeo } | null> {
    const row = await db.post.findUnique({
        where: { slug },
        select: { ...postSelect, content: true, hideAuthor: true, user: { select: { name: true } } },
    });
    if (!row) return null;
    const content = parseContent(row.content);
    const post: PostDetail = {
        ...summaryWithExcerpt(row, content.excerpt()),
        html: content.html(),
        authorName: row.hideAuthor ? null : row.user.name,
    };
    return { post, related: await getRelatedPosts(post), seo: postPageSeo(post, site) };
}

/**
 * Up to `limit` Posts: the newest of the same Department first, then the newest of the same Post type. Both are
 * read in one round trip; the type query takes `2 × limit` so that dropping the Department's Posts from it still
 * leaves enough.
 */
async function getRelatedPosts(post: PostSummary, limit = 3): Promise<PostSummary[]> {
    const [sameDepartment, sameType] = await Promise.all([
        post.department
            ? db.post.findMany({
                  where: { departmentId: post.department.id, id: { not: post.id } },
                  orderBy: { createdAt: 'desc' },
                  take: limit,
                  select: postSelect,
              })
            : [],
        db.post.findMany({
            where: { type: post.type, id: { not: post.id } },
            orderBy: { createdAt: 'desc' },
            take: post.department ? 2 * limit : limit,
            select: postSelect,
        }),
    ]);
    const taken = new Set(sameDepartment.map((row) => row.id));
    const rows = [...sameDepartment, ...sameType.filter((row) => !taken.has(row.id))].slice(0, limit);
    return toPostSummaries(rows);
}

export async function getSitemapData(): Promise<{
    departments: { slug: string; updatedAt: Date }[];
    posts: { slug: string; updatedAt: Date; imageUrl: string | null; title: string }[];
}> {
    const [departments, posts] = await Promise.all([
        db.department.findMany({ select: { slug: true, updatedAt: true }, orderBy: { name: 'asc' } }),
        db.post.findMany({
            select: { slug: true, updatedAt: true, highlightImagePath: true, title: true },
            orderBy: { createdAt: 'desc' },
        }),
    ]);
    return {
        departments,
        posts: posts.map((post) => ({
            slug: post.slug,
            updatedAt: post.updatedAt,
            imageUrl: publicUrl(post.highlightImagePath),
            title: post.title,
        })),
    };
}
