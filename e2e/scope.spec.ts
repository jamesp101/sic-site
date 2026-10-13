import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';

const SEAL = path.resolve('public/sic-seal.png');
const SEAL_BYTES = fs.readFileSync(SEAL);
const RUN = Date.now().toString(36);
const CIT_NAME = 'College of Information Technology';
const CIT_POST = 'CIT Unveils New AI Research Laboratory';
const CBA_POST = 'CBA Students Win National Entrepreneurship Award';
const MAIN_POST = '74th Foundation Week Celebration';
const MAIN_HERO = 'Welcome Introduction';
const CIT_HERO = 'CIT Tech Spotlight';
const CBA_HERO = 'CBA Commerce Highlight';

const switcher = (page: Page) => page.getByRole('button', { name: /^Department scope:/ });

async function chooseScope(page: Page, option: string | RegExp) {
    await expect(switcher(page)).toBeVisible();
    // The island must be hydrated before the menu opens.
    await expect(async () => {
        await switcher(page).click({ timeout: 2000 });
        await expect(page.getByRole('menuitemradio', { name: option })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole('menuitemradio', { name: option }).click();
}

async function scopeCookie(page: Page) {
    return (await page.context().cookies()).find((c) => c.name === 'admin_scope')?.value;
}

const sidebarLinks = (page: Page) => page.locator('[data-sidebar="content"]');
const rows = (page: Page) => page.locator('main tbody');

test.describe.configure({ mode: 'serial' });

test.describe('admin scope (superadmin)', () => {
    test.use({ storageState: ADMIN });

    test('seeds scoped downloads and slides', async ({ page }) => {
        await page.goto('/admin/posts');
        const origin = new URL(page.url()).origin;
        const layer = (text: string) =>
            JSON.stringify({
                v: 1,
                layers: [
                    {
                        type: 'text',
                        id: `t-${text.length}`,
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
        await page.goto('/admin/departments');
        const citId = (await page.getByRole('link', { name: `Org chart of ${CIT_NAME}` }).getAttribute('href'))?.match(
            /(\d+)\/members/,
        )?.[1];
        expect(citId, 'CIT id found in department list').toBeTruthy();

        for (const [name, departmentId] of [
            [`Scope Main ${RUN}`, null],
            [`Scope CIT ${RUN}`, citId!],
        ] as const) {
            const download = await page.request.post('/_actions/downloads.create', {
                headers: { Origin: origin },
                multipart: {
                    fileName: `${name} file`,
                    file: { name: 'seal.png', mimeType: 'image/png', buffer: SEAL_BYTES },
                    ...(departmentId ? { departmentId } : {}),
                },
            });
            expect(download.ok()).toBe(true);

            const slide = await page.request.post('/_actions/carousels.create', {
                headers: { Origin: origin },
                multipart: {
                    image: { name: 'seal.png', mimeType: 'image/png', buffer: SEAL_BYTES },
                    overlay: layer(`${name} slide`),
                    showOnMain: 'false',
                    ...(departmentId ? { departmentId } : {}),
                },
            });
            expect(slide.ok(), await slide.text()).toBe(true);
        }
    });

    test('switching scope filters posts, hero sections, downloads, carousels and the dashboard', async ({ page }) => {
        await page.goto('/admin/posts');
        // All departments is the default and every department is listed; no per-page filter exists.
        await expect(rows(page)).toContainText(CIT_POST);
        await expect(rows(page)).toContainText(CBA_POST);
        await expect(rows(page)).toContainText(MAIN_POST);
        await expect(page.getByRole('columnheader', { name: /Department/ })).toBeVisible();

        await chooseScope(page, CIT_NAME);
        await expect(switcher(page)).toContainText(CIT_NAME);
        await expect(rows(page)).toContainText(CIT_POST);
        await expect(rows(page)).not.toContainText(CBA_POST);
        await expect(rows(page)).not.toContainText(MAIN_POST);
        await expect(page.getByLabel('Filter by department')).toHaveCount(0);
        await expect(page.getByRole('columnheader', { name: /Department/ })).toHaveCount(0);
        await expect(page.getByTestId('scope-indicator')).toContainText(`Showing: ${CIT_NAME}`);
        expect(await scopeCookie(page)).toMatch(/^\d+$/);

        // Other filters keep working inside the scope.
        await page.goto('/admin/posts?type=event');
        await expect(rows(page)).toContainText('CIT Tech Seminar');
        await expect(rows(page)).not.toContainText(CIT_POST);

        // The scope follows navigation (and the Org chart link appears for a department).
        await sidebarLinks(page).getByRole('link', { name: 'Hero Sections', exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/hero-sections$/);
        await expect(page.getByLabel('Filter by page')).toHaveCount(0);
        await expect(rows(page)).toContainText(CIT_HERO);
        await expect(rows(page)).not.toContainText(CBA_HERO);
        await expect(rows(page)).not.toContainText(MAIN_HERO);

        await page.goto('/admin/downloads');
        await expect(page.getByLabel('Filter by department')).toHaveCount(0);
        await expect(page.locator('main')).toContainText(`Scope CIT ${RUN} file`);
        await expect(page.locator('main')).not.toContainText(`Scope Main ${RUN} file`);

        await page.goto('/admin/carousels');
        await expect(page.getByLabel('Show slides for')).toHaveCount(0);
        await expect(page.locator(`[data-slide-id][aria-label*="Scope CIT ${RUN}"]`)).toHaveCount(1);
        await expect(page.locator(`[data-slide-id][aria-label*="Scope Main ${RUN}"]`)).toHaveCount(0);

        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { level: 2, name: new RegExp(CIT_NAME) })).toBeVisible();

        const orgChart = sidebarLinks(page).getByRole('link', { name: 'Org chart', exact: true });
        await expect(orgChart).toHaveAttribute('href', /\/admin\/departments\/\d+\/members$/);
        await orgChart.click();
        await expect(page).toHaveURL(/\/admin\/departments\/\d+\/members$/);
    });

    test('Main page shows only general content', async ({ page }) => {
        await page.goto('/admin/posts');
        await chooseScope(page, /^Main page/);
        await expect(switcher(page)).toContainText('Main page');
        await expect(rows(page)).toContainText(MAIN_POST);
        await expect(rows(page)).not.toContainText(CIT_POST);
        await expect(rows(page)).not.toContainText(CBA_POST);
        expect(await scopeCookie(page)).toBe('main');

        await page.goto('/admin/hero-sections');
        await expect(rows(page)).toContainText(MAIN_HERO);
        await expect(rows(page)).not.toContainText(CIT_HERO);

        await page.goto('/admin/downloads');
        await expect(page.locator('main')).toContainText(`Scope Main ${RUN} file`);
        await expect(page.locator('main')).not.toContainText(`Scope CIT ${RUN} file`);

        await page.goto('/admin/carousels');
        await expect(page.locator(`[data-slide-id][aria-label*="Scope Main ${RUN}"]`)).toHaveCount(1);
        await expect(page.locator(`[data-slide-id][aria-label*="Scope CIT ${RUN}"]`)).toHaveCount(0);

        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { level: 2, name: /Main page/ })).toBeVisible();
        await expect(sidebarLinks(page).getByRole('link', { name: 'Org chart', exact: true })).toHaveCount(0);
    });

    test('All departments shows everything, and the choice survives a reload', async ({ page }) => {
        await page.goto('/admin/posts');
        await chooseScope(page, CIT_NAME);
        await expect(rows(page)).not.toContainText(CBA_POST);
        await page.reload();
        await expect(switcher(page)).toContainText(CIT_NAME);
        await expect(rows(page)).not.toContainText(CBA_POST);

        await chooseScope(page, /^All departments/);
        await expect(rows(page)).toContainText(CBA_POST);
        await expect(rows(page)).toContainText(CIT_POST);
        await expect(rows(page)).toContainText(MAIN_POST);
        expect(await scopeCookie(page)).toBe('all');

        await page.goto('/admin/hero-sections');
        await expect(rows(page)).toContainText(CBA_HERO);
        await expect(rows(page)).toContainText(MAIN_HERO);
    });

    test('an unknown department id in the cookie falls back to all', async ({ page, context }) => {
        await context.addCookies([
            {
                name: 'admin_scope',
                value: '999999',
                url: page.url() === 'about:blank' ? 'http://localhost:' + (process.env.E2E_PORT ?? 4399) : page.url(),
            },
        ]);
        await page.goto('/admin/posts');
        await expect(switcher(page)).toContainText('All departments');
        await expect(rows(page)).toContainText(CBA_POST);
    });

    test('create forms preselect the scoped department', async ({ page }) => {
        await page.goto('/admin/posts');
        await chooseScope(page, CIT_NAME);
        await page.goto('/admin/posts/create');
        await expect(page.locator('#departmentId')).toHaveValue(/\d+/);
        await expect(page.locator('#departmentId option:checked')).toHaveText(CIT_NAME);

        await page.goto('/admin/hero-sections/create');
        await expect(page.locator('#departmentId option:checked')).toHaveText(CIT_NAME);

        await page.goto('/admin/downloads/create');
        await expect(page.locator('#departmentId option:checked')).toHaveText(CIT_NAME);

        await page.goto('/admin/posts');
        await chooseScope(page, /^Main page/);
        await page.goto('/admin/posts/create');
        await expect(page.locator('#departmentId')).toHaveValue('');
        await expect(page.locator('#departmentId option:checked')).toContainText('General');
    });

    test('the "change" link opens the sidebar switcher', async ({ page }) => {
        await page.goto('/admin/posts');
        await expect(page.getByTestId('scope-indicator')).toBeVisible();
        await expect(async () => {
            await page.getByTestId('scope-indicator').getByRole('button', { name: 'change' }).click({ timeout: 2000 });
            await expect(page.getByRole('menuitemradio', { name: CIT_NAME })).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 15_000 });
    });
});

test.describe('admin scope (department user)', () => {
    test.use({ storageState: CIT });

    test('sees a static label and only their department’s data', async ({ page, context }) => {
        // A forged cookie for another department is ignored.
        await page.goto('/admin/posts');
        await context.addCookies([{ name: 'admin_scope', value: 'main', url: page.url() }]);
        await page.goto('/admin/posts');

        await expect(page.getByTestId('scope-static')).toContainText(CIT_NAME);
        await expect(page.getByRole('button', { name: /^Department scope:/ })).toHaveCount(0);
        await expect(rows(page)).toContainText(CIT_POST);
        await expect(rows(page)).not.toContainText(CBA_POST);
        await expect(rows(page)).not.toContainText(MAIN_POST);
        await expect(page.getByTestId('scope-indicator')).toHaveCount(0);

        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { level: 2, name: new RegExp(CIT_NAME) })).toBeVisible();
        await expect(sidebarLinks(page).getByRole('link', { name: 'Org chart', exact: true })).toBeVisible();
    });
});
