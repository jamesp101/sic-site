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
    PostDetail,
    PostFilters,
    PostSummary,
    PostType,
} from '@/lib/content-types';
import { parseOverlay } from '@/lib/carousel-overlay-schema';
import { extensionOf, fileKind } from '@/lib/files';
import { toPlainText } from '@/lib/markdown';
import { db, dbProvider } from './db';
import { downloadUrl, publicUrl } from './storage';

const EXCERPT_LENGTH = 200;
const DEFAULT_DIRECTORY = 'General';

/** Case-insensitive `contains`; SQLite/MySQL are already case-insensitive for ASCII, PostgreSQL needs `mode`. */
function contains(value: string): { contains: string; mode?: 'insensitive' } {
    return dbProvider === 'postgresql' ? { contains: value, mode: 'insensitive' } : { contains: value };
}

function excerptOf(content: string): string {
    const text = toPlainText(content);
    if (text.length <= EXCERPT_LENGTH) return text;
    return `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
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
    return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type as PostType,
        excerpt: excerptOf(row.content),
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
} satisfies Prisma.CarouselItemSelect;

function toSlide(row: Prisma.CarouselItemGetPayload<{ select: typeof carouselSelect }>): CarouselSlide {
    return {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        imageUrl: publicUrl(row.imagePath) ?? row.imagePath,
        linkUrl: row.linkUrl,
        overlay: parseOverlay(row.overlay),
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

/** Builds an unlimited-depth tree from a flat, already ordered member list. */
function buildMemberTree(
    rows: { id: number; name: string; role: string; imagePath: string | null; parentId: number | null }[],
): MemberNode[] {
    const nodes = new Map<number, MemberNode>();
    for (const row of rows) {
        nodes.set(row.id, {
            id: row.id,
            name: row.name,
            role: row.role,
            imageUrl: publicUrl(row.imagePath),
            children: [],
        });
    }
    const roots: MemberNode[] = [];
    for (const row of rows) {
        const node = nodes.get(row.id)!;
        const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
        (parent ? parent.children : roots).push(node);
    }
    return roots;
}

export async function getDepartmentPage(slug: string): Promise<{
    department: DepartmentDetail;
    carousel: CarouselSlide[];
    posts: PostSummary[];
    members: MemberNode[];
    heroSections: HeroSectionView[];
} | null> {
    const row = await db.department.findUnique({
        where: { slug },
        select: { ...departmentSelect, heroContent: true },
    });
    if (!row) return null;

    const [carousel, posts, members, heroes] = await Promise.all([
        db.carouselItem.findMany({
            where: { departmentId: row.id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: carouselSelect,
        }),
        db.post.findMany({ where: { departmentId: row.id }, orderBy: { createdAt: 'desc' }, select: postSelect }),
        db.member.findMany({
            where: { departmentId: row.id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, role: true, imagePath: true, parentId: true },
        }),
        heroSections(row.id),
    ]);

    return {
        department: { ...toDepartmentSummary(row), heroContent: row.heroContent },
        carousel: carousel.map(toSlide),
        posts: posts.map(toPostSummary),
        members: buildMemberTree(members),
        heroSections: heroes,
    };
}

export async function listPosts(filters: PostFilters = {}): Promise<PostSummary[]> {
    const where: Prisma.PostWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    const search = filters.search?.trim();
    if (search) where.OR = [{ title: contains(search) }, { content: contains(search) }];

    const rows = await db.post.findMany({
        where,
        orderBy: [{ createdAt: filters.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'desc' }],
        select: postSelect,
    });
    return rows.map(toPostSummary);
}

export async function getPostBySlug(slug: string): Promise<PostDetail | null> {
    const row = await db.post.findUnique({
        where: { slug },
        select: { ...postSelect, user: { select: { name: true } } },
    });
    if (!row) return null;
    return { ...toPostSummary(row), content: row.content, authorName: row.user.name };
}

export async function getRelatedPosts(post: PostSummary, limit = 3): Promise<PostSummary[]> {
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

export async function listDownloads(filters: DownloadFilters = {}): Promise<DownloadView[]> {
    const and: Prisma.DownloadWhereInput[] = [];
    if (filters.departmentId) and.push({ departmentId: filters.departmentId });
    if (filters.directory) {
        and.push(
            filters.directory === DEFAULT_DIRECTORY
                ? { OR: [{ directory: null }, { directory: DEFAULT_DIRECTORY }] }
                : { directory: filters.directory },
        );
    }
    const search = filters.search?.trim();
    if (search) {
        and.push({ OR: [{ fileName: contains(search) }, { tags: contains(search) }, { directory: contains(search) }] });
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

export async function getDownloadDirectories(departmentId?: number): Promise<string[]> {
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
