import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb(), dbProvider: 'sqlite' }));

const { db } = await import('./db');
const {
    DEFAULT_DIRECTORY,
    directoryWhere,
    encodeTags,
    getAdminFolders,
    getDirectoryNames,
    getDownloadsPage,
    parseTags,
    toAdminDownload,
} = await import('./downloads');

const names = (files: { fileName: string }[]) => files.map((file) => file.fileName).sort();

beforeAll(async () => {
    await db.department.createMany({
        data: [
            { id: 10, name: 'CIT', slug: 'cit' },
            { id: 11, name: 'CBA', slug: 'cba' },
        ],
    });
    const user = await db.user.create({ data: { name: 'Owner', email: 'owner@example.test' } });
    const file = (fileName: string, directory: string | null, departmentId: number | null, tags = '[]') => ({
        fileName,
        filePath: `downloads/${fileName}.pdf`,
        fileSize: 100,
        tags,
        directory,
        departmentId,
        userId: user.id,
    });
    await db.download.createMany({
        data: [
            file('Enrolment form', null, null),
            file('Handbook', 'General', 10),
            file('Syllabus', 'Academics', 10, '["curriculum"]'),
            file('Schedule', 'Academics', 11),
        ],
    });
    await db.downloadDirectory.create({ data: { name: 'Empty folder', departmentId: 11 } });
});

afterAll(closeTestDb);

describe('getDownloadsPage', () => {
    it('counts Downloads per Directory, files without one under General', async () => {
        const page = await getDownloadsPage({});
        expect(page.totalCount).toBe(4);
        expect(page.folders.map(({ name, count }) => [name, count])).toEqual([
            ['Academics', 2],
            ['Empty folder', 0],
            ['General', 2],
        ]);
        expect(page.groups.map((group) => [group.name, names(group.files)])).toEqual(
            expect.arrayContaining([
                ['General', ['Enrolment form', 'Handbook']],
                ['Academics', ['Schedule', 'Syllabus']],
            ]),
        );
        expect(page.seo.noindex).toBe(false);
        expect(page.seo.canonical).toBe('/downloads');
    });

    it('narrows the list by Directory while the counts keep covering every Directory', async () => {
        const page = await getDownloadsPage({ directory: 'General' });
        expect(names(page.downloads)).toEqual(['Enrolment form', 'Handbook']);
        expect(page.selected).toBe('General');
        expect(page.totalCount).toBe(4);
        expect(page.folders.find((folder) => folder.name === 'Academics')?.count).toBe(2);
        expect(page.seo.noindex).toBe(true);
        expect(page.seo.follow).toBe(true);
        expect(page.seo.canonical).toBe('/downloads');
    });

    it('filters by search and Department, and carries both into the folder links', async () => {
        const page = await getDownloadsPage({ search: 'curriculum', departmentId: 10 });
        expect(names(page.downloads)).toEqual(['Syllabus']);
        expect(page.totalCount).toBe(1);
        expect(page.folders.map((folder) => folder.name)).not.toContain('Empty folder');
        expect(page.folders.find((folder) => folder.name === 'Academics')?.href).toBe(
            '/downloads?search=curriculum&department_id=10&directory=Academics',
        );
        expect(page.allHref).toBe('/downloads?search=curriculum&department_id=10');
        expect(page.seo.noindex).toBe(true);
    });

    it('shows an unknown Directory as an empty list', async () => {
        const page = await getDownloadsPage({ directory: 'Nope' });
        expect(page.downloads).toEqual([]);
        expect(page.groups).toEqual([]);
    });
});

describe('getDirectoryNames', () => {
    it('lists each stored Directory name once, by name', async () => {
        const extra = await db.downloadDirectory.create({ data: { name: 'Empty folder', departmentId: 10 } });
        try {
            expect(await getDirectoryNames()).toEqual(['Empty folder']);
        } finally {
            await db.downloadDirectory.delete({ where: { id: extra.id } });
        }
    });
});

describe('Tags', () => {
    it('encodes the comma-separated field as a JSON array and decodes it back', () => {
        expect(encodeTags(' a, b ,,c')).toBe('["a","b","c"]');
        expect(encodeTags(null)).toBe('[]');
        expect(parseTags(encodeTags('freshman, 2026'))).toEqual(['freshman', '2026']);
    });

    it('tolerates legacy comma-separated, double-encoded and empty values', () => {
        expect(parseTags('a, b')).toEqual(['a', 'b']);
        expect(parseTags('"a,b"')).toEqual(['a', 'b']);
        expect(parseTags('  ')).toEqual([]);
        expect(parseTags(null)).toEqual([]);
    });
});

describe('admin Downloads', () => {
    const superadmin = { id: 1, role: 'superadmin', departmentId: null };
    const cit = { id: 2, role: 'department_user', departmentId: 10 };
    const all = { kind: 'all' } as const;
    const href = (name: string) => `?folder=${name}`;

    it('names a Download without a Directory General in the file view', async () => {
        const row = await db.download.findFirstOrThrow({
            where: { fileName: 'Enrolment form' },
            include: { department: { select: { name: true } } },
        });
        expect(row.directory).toBeNull();
        expect(toAdminDownload(row)).toMatchObject({ directory: DEFAULT_DIRECTORY, tags: [], departmentName: null });
    });

    it('merges files stored without a Directory into General in the folder map', async () => {
        const view = await getAdminFolders(superadmin, all, href);
        expect(view.totalFiles).toBe(4);
        expect(view.totalBytes).toBe(400);
        expect(view.folders.map(({ name, count, id, canDelete }) => [name, count, id !== null, canDelete])).toEqual([
            ['Empty folder', 0, true, true],
            ['General', 2, false, false],
            ['Academics', 2, false, false],
        ]);
        expect(view.folders.find((f) => f.name === 'Academics')?.href).toBe('?folder=Academics');
    });

    it('limits a department user to their Department but keeps shared folders listed', async () => {
        const view = await getAdminFolders(cit, { kind: 'department', id: 10, name: 'CIT', slug: 'cit' }, href);
        expect(view.totalFiles).toBe(2);
        expect(view.folders.map((f) => [f.name, f.count])).toEqual([
            ['Academics', 1],
            ['General', 1],
        ]);
    });

    it('filters General to files stored without a Directory as well as those stored as General', async () => {
        const rows = await db.download.findMany({ where: directoryWhere(DEFAULT_DIRECTORY) });
        expect(names(rows)).toEqual(['Enrolment form', 'Handbook']);
        expect(names(await db.download.findMany({ where: directoryWhere('Academics') }))).toEqual([
            'Schedule',
            'Syllabus',
        ]);
    });
});
