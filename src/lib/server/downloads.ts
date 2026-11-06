/**
 * Downloads: the one place that knows how a Download is stored (Tags as a JSON array in one column, a
 * missing Directory meaning General) and how it is viewed, on the public `/downloads` page and in the
 * admin Downloads list. Free of `astro:*` imports so it is unit-testable.
 */
import type { Prisma } from '@/generated/prisma/client';
import type { DownloadFilters, DownloadView } from '@/lib/content-types';
import { extensionOf, fileKind } from '@/lib/files';
import { downloadsHref, hasDownloadFilters } from '@/lib/post-filters';
import type { PageSeo } from '@/lib/seo';
import { departmentWhere, type AdminScope } from './admin-scope';
import { isSuperAdmin, type Actor } from './authz';
import { db } from './db';
import { startLayoutQueries, type LayoutQueries } from './queries';
import { textContains } from './search';
import { downloadUrl, storedUrl } from './storage';

/** The Directory of a Download stored without one. */
export const DEFAULT_DIRECTORY = 'General';

/** What a Download is stored with when it has no Directory: see `directoryOf`. */
export function directoryOf(stored: string | null): string {
    return stored || DEFAULT_DIRECTORY;
}

/** The Tags field of the upload form (comma-separated) as the value stored in `downloads.tags`. */
export function encodeTags(input: string | null | undefined): string {
    return JSON.stringify(splitTags(input ?? ''));
}

function splitTags(text: string): string[] {
    return text
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
}

/** Tags of a stored value: a JSON array, tolerating comma-separated strings and null. */
export function parseTags(raw: string | null): string[] {
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
    return splitTags(trimmed);
}

/** `where` fragment for the Downloads in one Directory; General also holds the ones stored without any. */
export function directoryWhere(directory: string): Prisma.DownloadWhereInput {
    return directory === DEFAULT_DIRECTORY ? { OR: [{ directory: null }, { directory }] } : { directory };
}

/** Directory names the upload form offers, by name, each once (Directories of different Departments may share a name). */
export async function getDirectoryNames(): Promise<string[]> {
    const rows = await db.downloadDirectory.findMany({ orderBy: { name: 'asc' }, select: { name: true } });
    return [...new Set(rows.map((row) => row.name))];
}

// ---------------------------------------------------------------------------
// Public `/downloads`
// ---------------------------------------------------------------------------

/** What `/downloads` renders: see `getDownloadsPage`. */
export interface DownloadsPage {
    layout: LayoutQueries;
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

/** What both Downloads views show of a stored file: its URL, extension (from the stored key, else the name) and kind. */
export function downloadFacts(row: { filePath: string; fileName: string }): {
    url: string;
    extension: string;
    kind: DownloadView['kind'];
} {
    const extension = extensionOf(row.filePath) || extensionOf(row.fileName);
    return { url: storedUrl(row.filePath), extension, kind: fileKind(extension) };
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
        const { url, extension, kind } = downloadFacts(row);
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
            kind,
            tags: parseTags(row.tags),
            directory: directoryOf(row.directory),
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
    const layout = startLayoutQueries();
    const [matching, directoryNames] = await Promise.all([
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
        layout,
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

// ---------------------------------------------------------------------------
// Admin `/admin/downloads`
// ---------------------------------------------------------------------------

/** A Download row of the admin list, as the Downloads manager renders it. */
export interface AdminDownloadRow {
    id: number;
    fileName: string;
    url: string;
    size: number;
    extension: string;
    kind: DownloadView['kind'];
    directory: string;
    tags: string[];
    departmentId: number | null;
    departmentName: string | null;
    createdAt: string;
}

export interface AdminFolder {
    name: string;
    count: number;
    /** `DownloadDirectory` id, null for a Directory that only exists because Downloads use it. */
    id: number | null;
    canDelete: boolean;
    href: string;
}

export function toAdminDownload(
    row: Prisma.DownloadGetPayload<{ include: { department: { select: { name: true } } } }>,
): AdminDownloadRow {
    const { url, extension, kind } = downloadFacts(row);
    return {
        id: row.id,
        fileName: row.fileName,
        url,
        size: row.fileSize,
        extension,
        kind,
        directory: directoryOf(row.directory),
        tags: parseTags(row.tags),
        departmentId: row.departmentId,
        departmentName: row.department?.name ?? null,
        createdAt: row.createdAt.toISOString(),
    };
}

/**
 * The admin folder map for (actor, scope): every stored Directory plus every Directory in use, with its
 * file count, and the stored total. Counts and total cover the whole scope, not the page or the search.
 * Shared Directories (no department) stay listed under a department scope. `href` builds a folder's link.
 */
export async function getAdminFolders(
    actor: Actor,
    scope: AdminScope,
    href: (folder: string) => string,
): Promise<{ totalFiles: number; totalBytes: number; folders: AdminFolder[] }> {
    const [groups, directories] = await Promise.all([
        db.download.groupBy({
            by: ['directory'],
            where: departmentWhere(actor, scope),
            _count: { _all: true },
            _sum: { fileSize: true },
        }),
        db.downloadDirectory.findMany({
            where: departmentWhere(actor, scope, { includeGeneral: true }),
            orderBy: { name: 'asc' },
        }),
    ]);

    const map = new Map<string, Omit<AdminFolder, 'href'>>();
    for (const d of directories) {
        map.set(d.name, {
            name: d.name,
            count: 0,
            id: d.id,
            canDelete: isSuperAdmin(actor) || d.departmentId === actor.departmentId,
        });
    }
    for (const group of groups) {
        const name = directoryOf(group.directory);
        const existing = map.get(name) ?? { name, count: 0, id: null, canDelete: false };
        map.set(name, { ...existing, count: existing.count + group._count._all });
    }

    return {
        totalFiles: groups.reduce((sum, g) => sum + g._count._all, 0),
        totalBytes: groups.reduce((sum, g) => sum + (g._sum.fileSize ?? 0), 0),
        folders: [...map.values()].map((folder) => ({ ...folder, href: href(folder.name) })),
    };
}
