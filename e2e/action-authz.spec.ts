import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { DEMO_DEPARTMENTS, DEMO_HERO_SECTIONS, DEMO_POSTS } from '../prisma/demo-data';
import { postAction, type ActionInput } from './actions';
import { ADMIN, CIT } from './auth-state';
import { RUN, SEAL_BYTES } from './support';

/**
 * Authorization of every mutating action, seen from outside: `POST /_actions/<name>` with the stored sessions.
 * A rejected call must leave the target row as an administrator sees it (admin pages), not just answer 4xx.
 */

const CIT_NAME = DEMO_DEPARTMENTS.cit.name;
const CBA_NAME = DEMO_DEPARTMENTS.cba.name;

interface Ids {
    cit: number;
    cba: number;
    cbaPost: number;
    mainPost: number;
    cbaHero: number;
    mainHero: number;
    cbaSlide: number;
    mainSlide: number;
    cbaDownload: number;
    mainDownload: number;
    cbaFolder: number;
    mainFolder: number;
    cbaMember: number;
    probeUser: number;
    probeLink: number;
    probeDepartment: number;
}
const ids = {} as Ids;

let adminContext: BrowserContext;
let citContext: BrowserContext;
let anonContext: BrowserContext;
let admin: Page;
let cit: Page;
let anon: Page;

const overlay = (text: string) =>
    JSON.stringify({
        v: 1,
        layers: [
            {
                type: 'text',
                id: 'authz-text',
                x: 6,
                y: 36,
                w: 55,
                rotation: 0,
                opacity: 100,
                role: 'heading',
                text,
                size: 'lg',
                align: 'left',
                color: 'white',
                font: 'serif',
            },
        ],
    });
const SEAL_IMAGE = { name: 'seal.png', mimeType: 'image/png', buffer: SEAL_BYTES };
const HIJACK = `Hijack ${RUN}`;

async function signedInPage(browser: Browser, storageState: string) {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto('/');
    return { context, page };
}

/** Succeeds or fails the test with the response text: used for the ADMIN setup calls. */
async function ok<T>(page: Page, name: string, input: ActionInput): Promise<T> {
    const response = await postAction<T>(page, name, input);
    expect(response.ok, `${name}: ${response.text}`).toBe(true);
    return response.data;
}

async function rowId(page: Page, url: string, rowText: string, hrefPart: string): Promise<number> {
    // Search by the row's text: other specs add newer rows in parallel, which can push it off page 1.
    await page.goto(`${url}?q=${encodeURIComponent(rowText)}`);
    const href = await page
        .locator('tr', { hasText: rowText })
        .first()
        .locator(`a[href*="${hrefPart}"]`)
        .first()
        .getAttribute('href');
    const id = href?.match(/(\d+)/)?.[1];
    expect(id, `${rowText} on ${url}`).toBeTruthy();
    return Number(id);
}

async function departmentId(page: Page, name: string): Promise<number> {
    await page.goto('/admin/departments');
    const href = await page.getByRole('link', { name: `Org chart of ${name}` }).getAttribute('href');
    return Number(href?.match(/(\d+)\/members/)?.[1]);
}

/** What an administrator sees of `urls` right now. */
const snapshot = async (urls: string[]) =>
    Promise.all(
        urls.map(async (url) => {
            const response = await admin.request.get(url);
            return `${url} ${response.status()}\n${await response.text()}`;
        }),
    );

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
    ({ context: adminContext, page: admin } = await signedInPage(browser, ADMIN));
    ({ context: citContext, page: cit } = await signedInPage(browser, CIT));
    anonContext = await browser.newContext();
    anon = await anonContext.newPage();
    await anon.goto('/');

    ids.cit = await departmentId(admin, CIT_NAME);
    ids.cba = await departmentId(admin, CBA_NAME);
    ids.cbaPost = await rowId(admin, '/admin/posts', DEMO_POSTS.entrepreneurshipAward.title, '/edit');
    ids.mainPost = await rowId(admin, '/admin/posts', DEMO_POSTS.foundationWeek.title, '/edit');
    ids.cbaHero = await rowId(admin, '/admin/hero-sections', DEMO_HERO_SECTIONS.cba.title, '/edit');
    ids.mainHero = await rowId(admin, '/admin/hero-sections', DEMO_HERO_SECTIONS.welcome.title, '/edit');

    await admin.goto(`/admin/departments/${ids.cba}/members`);
    const member = await admin.locator('[data-member-id]').first().getAttribute('data-member-id');
    ids.cbaMember = Number(member);
    expect(ids.cbaMember, 'a CBA member').toBeGreaterThan(0);

    // Carousel slides, downloads and folders are not seeded: one of each for CBA and for the main page.
    for (const [key, departmentField] of [
        ['cba', { departmentId: ids.cba }],
        ['main', {}],
    ] as const) {
        const slide = await ok<{ slide: { id: number } }>(admin, 'carousels.create', {
            multipart: {
                image: SEAL_IMAGE,
                overlay: overlay(`Authz ${key} slide ${RUN}`),
                showOnMain: key === 'main',
                ...departmentField,
            },
        });
        const download = await ok<{ id: number }>(admin, 'downloads.create', {
            multipart: {
                fileName: `Authz ${key} file ${RUN}`,
                file: { name: `authz-${key}.png`, mimeType: 'image/png', buffer: SEAL_BYTES },
                ...departmentField,
            },
        });
        const folder = await ok<{ id: number }>(admin, 'directories.create', {
            json: { name: `Authz ${key} folder ${RUN}`, ...departmentField },
        });
        if (key === 'cba') {
            ids.cbaSlide = slide.slide.id;
            ids.cbaDownload = download.id;
            ids.cbaFolder = folder.id;
        } else {
            ids.mainSlide = slide.slide.id;
            ids.mainDownload = download.id;
            ids.mainFolder = folder.id;
        }
    }

    // Probes for the superadmin-only actions: real rows that must survive a Department user's attempts.
    ids.probeUser = (
        await ok<{ id: number }>(admin, 'users.create', {
            json: {
                name: `Authz Probe ${RUN}`,
                email: `authz-probe-${RUN}@example.com`,
                role: 'department_user',
                departmentId: ids.cba,
                password: 'Probe-pass-1234',
            },
        })
    ).id;
    ids.probeLink = (
        await ok<{ id: number }>(admin, 'navlinks.create', {
            json: { label: `Authz Probe Link ${RUN}`, url: '/posts', order: 90, isActive: true },
        })
    ).id;
    ids.probeDepartment = (
        await ok<{ id: number }>(admin, 'departments.create', { multipart: { name: `Authz Probe Dept ${RUN}` } })
    ).id;

    // The setup actions queued flash toasts (`sic_flash`); the first admin page would show them and differ from later ones.
    await admin.goto('/admin/posts');
});

test.afterAll(async () => {
    const cleanup: [string, number][] = [
        ['carousels.delete', ids.cbaSlide],
        ['carousels.delete', ids.mainSlide],
        ['downloads.delete', ids.cbaDownload],
        ['downloads.delete', ids.mainDownload],
        ['directories.delete', ids.cbaFolder],
        ['directories.delete', ids.mainFolder],
        ['users.delete', ids.probeUser],
        ['navlinks.delete', ids.probeLink],
        ['departments.delete', ids.probeDepartment],
    ];
    for (const [name, id] of cleanup) if (id) await postAction(admin, name, { json: { id } });
    await Promise.all([adminContext?.close(), citContext?.close(), anonContext?.close()]);
});

interface Case {
    name: string;
    action: string;
    input: (ids: Ids) => ActionInput;
    /** Admin pages that show the target row. */
    watch: (ids: Ids) => string[];
    status: 403 | 404;
}

const postForm = (id: number) => ({
    multipart: { id, title: HIJACK, content: 'Hijacked', type: 'article', isFeatured: false, hideAuthor: false },
});
const heroJson = (id: number) => ({ json: { id, title: HIJACK, content: 'Hijacked', order: 99, isActive: false } });
const slideForm = (id: number) => ({ multipart: { id, overlay: overlay(HIJACK) } });
const member = (departmentId: number, id: number) => ({
    multipart: { id, departmentId, name: HIJACK, role: HIJACK, order: 77 },
});
const placements = (id: number) => ({ json: { placements: [{ id, parentId: null, order: 50 }] } });

/** Rows of another Department (CBA) and of the main site, which the CIT Department user must not touch. */
const FOREIGN_ROWS: Case[] = [
    ...(['cba', 'main'] as const).flatMap((owner): Case[] => {
        const id = (ids: Ids, kind: string) => ids[`${owner}${kind}` as keyof Ids];
        const edit = (path: string, kind: string) => (ids: Ids) => [`${path}/${id(ids, kind)}/edit`];
        return [
            {
                name: `posts.update on a ${owner} post`,
                action: 'posts.update',
                input: (i) => postForm(id(i, 'Post')),
                watch: edit('/admin/posts', 'Post'),
                status: 403,
            },
            {
                name: `posts.delete on a ${owner} post`,
                action: 'posts.delete',
                input: (i) => ({ json: { id: id(i, 'Post') } }),
                watch: edit('/admin/posts', 'Post'),
                status: 403,
            },
            {
                name: `heroSections.update on a ${owner} hero section`,
                action: 'heroSections.update',
                input: (i) => heroJson(id(i, 'Hero')),
                watch: edit('/admin/hero-sections', 'Hero'),
                status: 403,
            },
            {
                name: `heroSections.delete on a ${owner} hero section`,
                action: 'heroSections.delete',
                input: (i) => ({ json: { id: id(i, 'Hero') } }),
                watch: edit('/admin/hero-sections', 'Hero'),
                status: 403,
            },
            {
                name: `carousels.update on a ${owner} slide`,
                action: 'carousels.update',
                input: (i) => slideForm(id(i, 'Slide')),
                watch: () => ['/admin/carousels'],
                status: 403,
            },
            {
                name: `carousels.placement on a ${owner} slide`,
                action: 'carousels.placement',
                input: (i) => ({ json: { id: id(i, 'Slide'), showOnMain: true } }),
                watch: () => ['/admin/carousels'],
                status: 403,
            },
            {
                name: `carousels.duplicate on a ${owner} slide`,
                action: 'carousels.duplicate',
                input: (i) => ({ json: { id: id(i, 'Slide') } }),
                watch: () => ['/admin/carousels'],
                status: 403,
            },
            {
                name: `carousels.reorder on a ${owner} slide`,
                action: 'carousels.reorder',
                input: (i) => ({ json: { ids: [id(i, 'Slide')] } }),
                watch: () => ['/admin/carousels'],
                status: 403,
            },
            {
                name: `carousels.delete on a ${owner} slide`,
                action: 'carousels.delete',
                input: (i) => ({ json: { id: id(i, 'Slide') } }),
                watch: () => ['/admin/carousels'],
                status: 403,
            },
            {
                name: `downloads.delete on a ${owner} download`,
                action: 'downloads.delete',
                input: (i) => ({ json: { id: id(i, 'Download') } }),
                watch: () => ['/admin/downloads'],
                status: 403,
            },
            {
                name: `directories.delete on a ${owner} folder`,
                action: 'directories.delete',
                input: (i) => ({ json: { id: id(i, 'Folder') } }),
                watch: () => ['/admin/downloads'],
                status: 403,
            },
        ];
    }),
    // Departments and members exist only for CBA (the main site has no org chart or department record).
    {
        name: 'departments.update on CBA',
        action: 'departments.update',
        input: (i) => ({ multipart: { id: i.cba, name: HIJACK } }),
        watch: (i) => [`/admin/departments/${i.cba}/edit`, '/admin/departments'],
        status: 403,
    },
    {
        name: 'members.create in CBA',
        action: 'members.create',
        input: (i) => ({ multipart: { departmentId: i.cba, name: HIJACK, role: HIJACK, order: 77 } }),
        watch: (i) => [`/admin/departments/${i.cba}/members`],
        status: 403,
    },
    {
        name: 'members.update of a CBA member',
        action: 'members.update',
        input: (i) => member(i.cba, i.cbaMember),
        watch: (i) => [`/admin/departments/${i.cba}/members`],
        status: 403,
    },
    {
        name: 'members.update of a CBA member through the CIT department',
        action: 'members.update',
        input: (i) => member(i.cit, i.cbaMember),
        watch: (i) => [`/admin/departments/${i.cba}/members`],
        status: 404,
    },
    {
        name: 'members.reorder in CBA',
        action: 'members.reorder',
        input: (i) => ({ json: { departmentId: i.cba, ...placements(i.cbaMember).json } }),
        watch: (i) => [`/admin/departments/${i.cba}/members`],
        status: 403,
    },
    {
        name: 'members.delete of a CBA member',
        action: 'members.delete',
        input: (i) => ({ json: { departmentId: i.cba, id: i.cbaMember } }),
        watch: (i) => [`/admin/departments/${i.cba}/members`],
        status: 403,
    },
    {
        name: 'members.delete of a CBA member through the CIT department',
        action: 'members.delete',
        input: (i) => ({ json: { departmentId: i.cit, id: i.cbaMember } }),
        watch: (i) => [`/admin/departments/${i.cba}/members`],
        status: 404,
    },
];

/** Actions only a superadmin may call. */
const SUPERADMIN_ONLY: Omit<Case, 'status'>[] = [
    {
        name: 'users.create',
        action: 'users.create',
        input: (i) => ({
            json: {
                name: HIJACK,
                email: `hijack-${RUN}@example.com`,
                role: 'department_user',
                departmentId: i.cit,
                password: 'Hijack-pass-1234',
            },
        }),
        watch: () => ['/admin/users'],
    },
    {
        name: 'users.update',
        action: 'users.update',
        input: (i) => ({
            json: { id: i.probeUser, name: HIJACK, email: `authz-probe-${RUN}@example.com`, role: 'superadmin' },
        }),
        watch: (i) => [`/admin/users/${i.probeUser}/edit`, '/admin/users'],
    },
    {
        name: 'users.delete',
        action: 'users.delete',
        input: (i) => ({ json: { id: i.probeUser } }),
        watch: (i) => [`/admin/users/${i.probeUser}/edit`, '/admin/users'],
    },
    {
        name: 'navlinks.create',
        action: 'navlinks.create',
        input: () => ({ json: { label: HIJACK, url: '/posts', order: 91, isActive: true } }),
        watch: () => ['/admin/navlinks'],
    },
    {
        name: 'navlinks.update',
        action: 'navlinks.update',
        input: (i) => ({ json: { id: i.probeLink, label: HIJACK, url: '/posts', order: 91, isActive: false } }),
        watch: () => ['/admin/navlinks'],
    },
    {
        name: 'navlinks.reorder',
        action: 'navlinks.reorder',
        input: (i) => ({ json: { items: [{ id: i.probeLink, parentId: null, order: 5 }] } }),
        watch: () => ['/admin/navlinks'],
    },
    {
        name: 'navlinks.delete',
        action: 'navlinks.delete',
        input: (i) => ({ json: { id: i.probeLink } }),
        watch: () => ['/admin/navlinks'],
    },
    {
        name: 'settings.updateLanding',
        action: 'settings.updateLanding',
        input: () => ({ json: { welcomeHeroContent: HIJACK } }),
        watch: () => ['/admin/settings/landing', '/'],
    },
    {
        name: 'departments.create',
        action: 'departments.create',
        input: () => ({ multipart: { name: HIJACK } }),
        watch: () => ['/admin/departments'],
    },
    {
        name: 'departments.delete',
        action: 'departments.delete',
        input: (i) => ({ json: { id: i.probeDepartment } }),
        watch: (i) => [`/admin/departments/${i.probeDepartment}/edit`, '/admin/departments'],
    },
];

/** Own-account actions: they act on the caller only, so there is no other row to reach. */
const SELF_SERVICE = [
    'account.updateProfile',
    'account.changePassword',
    'account.deleteAccount',
    'account.confirmPassword',
];
const PUBLIC_ACTIONS = ['contact.send'];

/** `group.name` of every action defined in `src/actions/*.ts`. */
function definedActions(): string[] {
    const dir = path.resolve('src/actions');
    const found: string[] = [];
    for (const file of fs.readdirSync(dir)) {
        if (file === 'index.ts' || !file.endsWith('.ts')) continue;
        const source = fs.readFileSync(path.join(dir, file), 'utf8');
        const group = source.match(/^export const (\w+) = \{/m)?.[1];
        for (const match of source.matchAll(/^ {4}(\w+): defineAction\(/gm)) found.push(`${group}.${match[1]}`);
    }
    return found;
}

const CREATES = ['posts.create', 'heroSections.create', 'carousels.create', 'downloads.create', 'directories.create'];
const ALL_ACTIONS = [
    ...new Set([
        ...FOREIGN_ROWS.map((c) => c.action),
        ...SUPERADMIN_ONLY.map((c) => c.action),
        ...CREATES,
        ...SELF_SERVICE,
        ...PUBLIC_ACTIONS,
    ]),
];

test.describe('coverage', () => {
    test('this spec classifies every action in src/actions and nothing else', () => {
        expect(definedActions().sort()).toEqual([...ALL_ACTIONS].sort());
    });
});

test.describe('signed-out visitor', () => {
    for (const action of ALL_ACTIONS.filter((name) => !PUBLIC_ACTIONS.includes(name))) {
        // An empty JSON body would be a 400 (or 415 for form actions) if the action ever read it.
        test(`${action} answers 401 before the body is processed`, async () => {
            const response = await postAction(anon, action);
            expect(response.status, response.text).toBe(401);
            expect(response.data).toMatchObject({ code: 'UNAUTHORIZED' });
        });
    }

    test('contact.send is public: it reads the body (400 for an empty one)', async () => {
        const response = await postAction(anon, 'contact.send', { multipart: {} });
        expect(response.status).toBe(400);
    });
});

test.describe('Department user (CIT)', () => {
    for (const c of FOREIGN_ROWS) {
        test(`${c.name} answers ${c.status} and leaves the row unchanged`, async () => {
            const watch = c.watch(ids);
            const before = await snapshot(watch);
            // The page of a row that exists must render, so an unchanged snapshot is meaningful.
            for (const view of before) expect(view).not.toMatch(/ (404|500)\n/);

            const response = await postAction(cit, c.action, c.input(ids));
            expect(response.status, response.text).toBe(c.status);

            expect(await snapshot(watch)).toEqual(before);
        });
    }

    for (const c of SUPERADMIN_ONLY) {
        test(`${c.name} answers 403 and leaves the data unchanged`, async () => {
            const watch = c.watch(ids);
            const before = await snapshot(watch);

            const response = await postAction(cit, c.action, c.input(ids));
            expect(response.status, response.text).toBe(403);

            expect(await snapshot(watch)).toEqual(before);
        });
    }

    test('creates name another department but land in the CIT department only', async () => {
        const marker = `Forced ${RUN}`;
        const created: [string, number][] = [];
        const keep = async <T extends { id: number }>(
            deleter: string,
            call: Promise<{ status: number; data: T; text: string }>,
        ) => {
            const response = await call;
            expect(response.status, response.text).toBe(200);
            created.push([deleter, response.data.id]);
        };

        await keep(
            'posts.delete',
            postAction<{ id: number }>(cit, 'posts.create', {
                multipart: {
                    title: `${marker} post`,
                    content: 'Body',
                    type: 'article',
                    isFeatured: false,
                    hideAuthor: false,
                    departmentId: ids.cba,
                },
            }),
        );
        await keep(
            'heroSections.delete',
            postAction<{ id: number }>(cit, 'heroSections.create', {
                json: { title: `${marker} hero`, content: 'Body', order: 1, isActive: true, departmentId: ids.cba },
            }),
        );
        await keep(
            'directories.delete',
            postAction<{ id: number }>(cit, 'directories.create', {
                json: { name: `${marker} folder`, departmentId: ids.cba },
            }),
        );
        await keep(
            'downloads.delete',
            postAction<{ id: number }>(cit, 'downloads.create', {
                multipart: {
                    fileName: `${marker} file`,
                    file: { ...SEAL_IMAGE, name: 'forced.png' },
                    departmentId: ids.cba,
                },
            }),
        );
        const slide = await postAction<{ slide: { id: number } }>(cit, 'carousels.create', {
            multipart: {
                image: SEAL_IMAGE,
                overlay: overlay(`${marker} slide`),
                showOnMain: false,
                departmentId: ids.cba,
            },
        });
        expect(slide.status, slide.text).toBe(200);
        created.push(['carousels.delete', slide.data.slide.id]);

        try {
            const pages = ['/admin/posts', '/admin/hero-sections', '/admin/downloads', '/admin/carousels'];
            const viewAs = async (scope: number) => {
                await adminContext.addCookies([{ name: 'admin_scope', value: String(scope), url: admin.url() }]);
                return (await snapshot(pages)).join('\n');
            };
            const cbaView = await viewAs(ids.cba);
            const citView = await viewAs(ids.cit);
            await adminContext.addCookies([{ name: 'admin_scope', value: 'all', url: admin.url() }]);

            for (const what of ['post', 'hero', 'folder', 'file', 'slide']) {
                expect(citView, `${what} in CIT`).toContain(`${marker} ${what}`);
                expect(cbaView, `${what} in CBA`).not.toContain(`${marker} ${what}`);
            }
        } finally {
            for (const [deleter, id] of created) await postAction(cit, deleter, { json: { id } });
        }
    });
});
