import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb(), dbProvider: 'sqlite' }));

const { db } = await import('./db');
const { getDownloadsPage } = await import('./queries');

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
