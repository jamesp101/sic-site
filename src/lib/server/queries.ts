import type { Prisma } from '@/generated/prisma/client';
import type {
    CarouselSlide,
    DepartmentDetail,
    DepartmentSummary,
    DownloadFilters,
    DownloadView,
    HeroSectionView,
    MemberNode,
    NavLinkView,
    Paginated,
    PostDetail,
    PostFilters,
    PostSummary,
    PostType,
} from '@/lib/content-types';
import { excerptOf, parseContent } from '@/lib/blocks/content';
import { slideDocument } from '@/lib/carousel-overlay-schema';
import { extensionOf, fileKind } from '@/lib/files';
import { buildOrgTree, type OrgNode } from '@/lib/org-tree';
import { DEFAULT_DIRECTORY, downloadsHref, hasDownloadFilters } from '@/lib/post-filters';
import { departmentPageSeo, postPageSeo, postsListSeo, type PageSeo } from '@/lib/seo';
import { slideVideoView } from './carousel-admin';
import { db } from './db';
import { textContains } from './search';
import { downloadUrl, publicUrl } from './storage';

/** What `/downloads` renders: see `getDownloadsPage`. */
export interface DownloadsPage {
    departments: DepartmentSummary[];
    /** The files to list: matching the search and Department, narrowed to `selected`. */
    downloads: DownloadView[];
    /** `downloads` grouped by Directory, in order of first appearance. */
    groups: { name: string; files: DownloadView[] }[];
    /** Every Directory with the number of files matching the search and Department, and its link. */
    folders: { name: string; count: number; href: string }[];
    /** The selected Directory, `''` for all. */
    selected: string;
    /** Link that clears the Directory but keeps the search and Department. */
    allHref: string;
    /** Files matching the search and Department, whatever the Directory. */
    totalCount: number;
    seo: PageSeo;
}

const departmentRefSelect = { id: true, name: true, slug: true } as const;

const postSelect = {
    id: true,
    title: true,
    slug: true,
    type: true,
    content: true,
    highlightImagePath: true,
    startDate: true,
    endDate: true,
    isFeatured: true,
    createdAt: true,
    updatedAt: true,
    department: { select: departmentRefSelect },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

function toPostSummary(row: PostRow): PostSummary {
    return summaryWithExcerpt(row, excerptOf(row.content));
}

function summaryWithExcerpt(row: PostRow, excerpt: string): PostSummary {
    return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type as PostType,
        excerpt,
        imageUrl: publicUrl(row.highlightImagePath),
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
        updatedAt: row.updatedAt,
    };
}

const carouselSelect = {
    id: true,
    title: true,
    subtitle: true,
    imagePath: true,
    linkUrl: true,
    overlay: true,
    videoPath: true,
    videoUrl: true,
} satisfies Prisma.CarouselItemSelect;

function toSlide(row: Prisma.CarouselItemGetPayload<{ select: typeof carouselSelect }>): CarouselSlide {
    const doc = slideDocument(row);
    return {
        id: row.id,
        imageUrl: publicUrl(row.imagePath) ?? row.imagePath,
        layers: doc.layers,
        mobile: doc.mobile,
        video: slideVideoView(row),
    };
}

function heroSections(departmentId: number | null): Promise<HeroSectionView[]> {
    return db.heroSection.findMany({
        where: { departmentId, isActive: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, content: true },
    });
}

export async function getNavLinks(): Promise<NavLinkView[]> {
    const rows = await db.navigationLink.findMany({
        where: { isActive: true, parentId: null },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: {
            id: true,
            label: true,
            url: true,
            children: {
                where: { isActive: true },
                orderBy: [{ order: 'asc' }, { id: 'asc' }],
                select: { id: true, label: true, url: true },
            },
        },
    });
    return rows.map((row) => ({
        id: row.id,
        label: row.label,
        url: row.url,
        children: row.children.map((child) => ({ ...child, children: [] })),
    }));
}

export async function getDepartments(): Promise<DepartmentSummary[]> {
    const rows = await db.department.findMany({ orderBy: { name: 'asc' }, select: departmentSelect });
    return rows.map(toDepartmentSummary);
}

export async function getHomeData(): Promise<{
    carousel: CarouselSlide[];
    departments: DepartmentSummary[];
    latestPosts: PostSummary[];
    welcomeHero: string | null;
    heroSections: HeroSectionView[];
}> {
    const [carousel, departments, latestPosts, welcomeHero, heroes] = await Promise.all([
        db.carouselItem.findMany({
            where: { showOnMain: true },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: carouselSelect,
        }),
        getDepartments(),
        db.post.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: postSelect }),
        getSetting('welcome_hero_content'),
        heroSections(null),
    ]);
    return {
        carousel: carousel.map(toSlide),
        departments,
        latestPosts: latestPosts.map(toPostSummary),
        welcomeHero,
        heroSections: heroes,
    };
}

export async function getDepartmentPage(
    slug: string,
    site: URL,
): Promise<{
    department: DepartmentDetail;
    carousel: CarouselSlide[];
    posts: PostSummary[];
    members: MemberNode[];
    heroSections: HeroSectionView[];
    seo: PageSeo;
} | null> {
    const row = await db.department.findUnique({
        where: { slug },
        select: { ...departmentSelect, heroContent: true },
    });
    if (!row) return null;

    const [carousel, posts, memberRows, heroes] = await Promise.all([
        db.carouselItem.findMany({
            where: { departmentId: row.id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: carouselSelect,
        }),
        db.post.findMany({ where: { departmentId: row.id }, orderBy: { createdAt: 'desc' }, select: postSelect }),
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
        children: children.map(toNode),
    });
    const members = buildOrgTree(memberRows).map(toNode);
    const department: DepartmentDetail = { ...toDepartmentSummary(row), heroContent: row.heroContent };
    const slides = carousel.map(toSlide);

    return {
        department,
        carousel: slides,
        posts: posts.map(toPostSummary),
        members,
        heroSections: heroes,
        seo: departmentPageSeo(department, members, slides[0]?.imageUrl, site),
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
        items: rows.map(toPostSummary),
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
        select: { ...postSelect, user: { select: { name: true } } },
    });
    if (!row) return null;
    const content = parseContent(row.content);
    const post: PostDetail = {
        ...summaryWithExcerpt(row, content.excerpt()),
        html: content.html(),
        authorName: row.user.name,
    };
    return { post, related: await getRelatedPosts(post), seo: postPageSeo(post, site) };
}

async function getRelatedPosts(post: PostSummary, limit = 3): Promise<PostSummary[]> {
    const sameDepartment = post.department
        ? await db.post.findMany({
              where: { departmentId: post.department.id, id: { not: post.id } },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: postSelect,
          })
        : [];
    if (sameDepartment.length >= limit) return sameDepartment.map(toPostSummary);

    const sameType = await db.post.findMany({
        where: { type: post.type, id: { notIn: [post.id, ...sameDepartment.map((row) => row.id)] } },
        orderBy: { createdAt: 'desc' },
        take: limit - sameDepartment.length,
        select: postSelect,
    });
    return [...sameDepartment, ...sameType].map(toPostSummary);
}

/** Tags are stored as a JSON array; tolerate comma separated strings and null. */
function parseTags(raw: string | null): string[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((tag) => String(tag).trim()).filter(Boolean);
        if (typeof parsed === 'string') return parseTags(parsed);
    } catch {
        // not JSON: fall through to comma split
    }
    return trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
}

async function listDownloads(filters: Pick<DownloadFilters, 'search' | 'departmentId'>): Promise<DownloadView[]> {
    const and: Prisma.DownloadWhereInput[] = [];
    if (filters.departmentId) and.push({ departmentId: filters.departmentId });
    const search = filters.search?.trim();
    if (search) {
        and.push({
            OR: [
                { fileName: textContains(search) },
                { tags: textContains(search) },
                { directory: textContains(search) },
            ],
        });
    }

    const rows = await db.download.findMany({
        where: { AND: and },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            fileName: true,
            filePath: true,
            fileSize: true,
            tags: true,
            directory: true,
            createdAt: true,
            department: { select: departmentRefSelect },
        },
    });

    return rows.map((row) => {
        const url = publicUrl(row.filePath) ?? row.filePath;
        const extension = extensionOf(row.filePath) || extensionOf(row.fileName);
        return {
            id: row.id,
            fileName: row.fileName,
            url,
            downloadUrl: downloadUrl(
                row.filePath,
                row.fileName + (extensionOf(row.fileName) || !extension ? '' : `.${extension}`),
            ),
            size: row.fileSize,
            extension,
            kind: fileKind(extension),
            tags: parseTags(row.tags),
            directory: row.directory || DEFAULT_DIRECTORY,
            createdAt: row.createdAt,
            department: row.department,
        };
    });
}

async function getDownloadDirectories(departmentId?: number): Promise<string[]> {
    const where = departmentId ? { departmentId } : {};
    const [custom, used] = await Promise.all([
        db.downloadDirectory.findMany({ where, select: { name: true } }),
        db.download.findMany({ where, distinct: ['directory'], select: { directory: true } }),
    ]);
    const names = new Set<string>([DEFAULT_DIRECTORY]);
    for (const row of custom) names.add(row.name);
    for (const row of used) if (row.directory) names.add(row.directory);
    return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * The public `/downloads` page: the Downloads matching the search and Department, the Directories with
 * how many of those each holds, and the list narrowed to `filters.directory`. Not paginated: the page
 * groups files by Directory and shows a count per group, which a page boundary would cut through.
 */
export async function getDownloadsPage(filters: DownloadFilters): Promise<DownloadsPage> {
    const { search, departmentId, directory } = filters;
    const [departments, matching, directoryNames] = await Promise.all([
        getDepartments(),
        listDownloads({ search, departmentId }),
        getDownloadDirectories(departmentId),
    ]);

    const counts = new Map<string, number>(directoryNames.map((name) => [name, 0]));
    for (const file of matching) counts.set(file.directory, (counts.get(file.directory) ?? 0) + 1);
    const folders = [...counts].map(([name, count]) => ({
        name,
        count,
        href: downloadsHref({ search, departmentId, directory: name }),
    }));

    const downloads = directory ? matching.filter((file) => file.directory === directory) : matching;
    const groups = new Map<string, DownloadView[]>();
    for (const file of downloads) groups.set(file.directory, [...(groups.get(file.directory) ?? []), file]);

    return {
        departments,
        downloads,
        groups: [...groups].map(([name, files]) => ({ name, files })),
        folders,
        selected: directory ?? '',
        allHref: downloadsHref({ search, departmentId }),
        totalCount: matching.length,
        seo: {
            title: 'Downloads',
            description:
                'Official forms, academic guides, curriculum checklists and schedules from San Isidro College, organised by folder and department.',
            canonical: downloadsHref({}),
            noindex: hasDownloadFilters(filters),
            follow: true,
            breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Downloads' }],
        },
    };
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

export async function getSetting(key: string): Promise<string | null> {
    const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
    return row?.value ?? null;
}
