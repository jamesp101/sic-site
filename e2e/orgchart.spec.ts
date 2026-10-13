import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';

// Names are unique per run; every member this spec adds is deleted again before it ends,
// so the seeded chart (and other specs that read it) is left as it was found.
const RUN = Date.now().toString(36);
const DEAN = 'Prof. Juan Dela Cruz';
const MGR = `Mgr ${RUN}`;
const ALBA = `Alba ${RUN}`;
const ALBA_RENAMED = `Alba Renamed ${RUN}`;
const BETA = `Beta ${RUN}`;
const CORA = `Cora ${RUN}`;
const DEPT = `Dept ${RUN}`;

test.describe.configure({ mode: 'serial' });

const isReorder = (r: { url(): string; ok(): boolean }) => r.url().includes('/_actions/members.reorder') && r.ok();
const isAction = (name: string) => (r: { url(): string; ok(): boolean }) =>
    r.url().includes(`/_actions/members.${name}`) && r.ok();

const item = (page: Page, name: string) => page.locator(`li[role="treeitem"][data-name="${name}"]`);
const card = (page: Page, name: string) =>
    page.getByTestId('org-card').filter({ has: page.getByTestId('member-name').getByText(name, { exact: true }) });

/** Names of the direct reports of `name`, in chart order. */
const reports = (page: Page, name: string) =>
    item(page, name).evaluate((el) =>
        [...el.querySelectorAll(':scope > ul > li')].map((li) => li.getAttribute('data-name') ?? ''),
    );

const roots = (page: Page) =>
    page
        .locator('ul[role="tree"]')
        .evaluate((el) => [...el.querySelectorAll(':scope > li')].map((li) => li.getAttribute('data-name') ?? ''));

/** Reports of `name` as the public page's server-rendered HTML shows them (no JavaScript). */
async function publicReports(browser: Browser, name: string) {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/departments/cit#org-chart');
    const result = await page.evaluate((target) => {
        const nameOf = (li: Element) => li.querySelector(':scope > .org-card .min-w-0 > span')?.textContent?.trim();
        const li = [...document.querySelectorAll('#org-chart li.org-item')].find((el) => nameOf(el) === target);
        return li ? [...li.querySelectorAll(':scope > ul > li')].map((child) => nameOf(child) ?? '') : null;
    }, name);
    await context.close();
    return result;
}

/** Department ids, read from the superadmin's department list. */
async function departmentIds(browser: Browser) {
    const context = await browser.newContext({ storageState: ADMIN });
    const page = await context.newPage();
    await page.goto('/admin/departments');
    const idOf = async (name: string) =>
        (await page.getByRole('link', { name: `Org chart of ${name}` }).getAttribute('href'))!.match(
            /(\d+)\/members/,
        )![1];
    const ids = {
        cit: await idOf('College of Information Technology'),
        cba: await idOf('College of Business Administration'),
    };
    await context.close();
    return ids;
}

/** Opens a department's chart and waits for the editor island to hydrate. */
async function openChart(page: Page, id: string) {
    await page.goto(`/admin/departments/${id}/members`);
    await expect(page.getByRole('tree', { name: /organization chart/i })).toBeVisible();
    await expect(page.locator('astro-island[component-url*="OrgChartEditor"]:not([ssr])')).toHaveCount(1);
    if (await page.getByRole('button', { name: 'Fit chart to view' }).isVisible()) await fit(page);
}

/** Zooms to fit so every card is inside the clipped canvas (Playwright cannot scroll a panned canvas). */
const fit = (page: Page) => page.getByRole('button', { name: 'Fit chart to view' }).click();

async function addFromCard(
    page: Page,
    near: string,
    kind: 'report' | 'peer',
    name: string,
    role: string,
    reorders = false,
) {
    await fit(page);
    await card(page, near).hover();
    await page
        .getByRole('button', { name: kind === 'report' ? `Add direct report to ${near}` : `Add peer beside ${near}` })
        .click();
    const inspector = page.getByTestId('member-inspector');
    await expect(inspector).toBeVisible();
    await inspector.getByLabel('Full name').fill(name);
    await inspector.getByLabel('Role / position title').fill(role);
    const created = page.waitForResponse(isAction('create'));
    const moved = reorders ? page.waitForResponse(isReorder) : Promise.resolve(null);
    await inspector.getByRole('button', { name: 'Add member' }).click();
    await created;
    await moved;
    await expect(card(page, name)).toBeVisible();
}

/** Runs `act` and waits for the reorder request it triggers to be saved. */
async function saving(page: Page, act: () => Promise<unknown>) {
    const saved = page.waitForResponse(isReorder);
    await act();
    await saved;
}

async function confirmDelete(page: Page, expected?: RegExp) {
    const dialog = page.getByRole('dialog');
    if (expected) await expect(dialog).toContainText(expected);
    const deleted = page.waitForResponse(isAction('delete'));
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await deleted;
    await expect(dialog).toBeHidden();
}

let ids: { cit: string; cba: string };

test.beforeAll(async ({ browser }) => {
    ids = await departmentIds(browser);
});

test.describe('org chart editor (superadmin)', () => {
    test.use({ storageState: ADMIN });

    test('replaces the table with a tree of cards and a toolbar', async ({ page }) => {
        await openChart(page, ids.cit);
        await expect(page.locator('table')).toHaveCount(0);
        await expect(page.getByTestId('member-count')).toHaveText('5 members');
        await expect(page.getByRole('tree', { name: /organization chart/i })).toBeVisible();
        expect(await roots(page)).toEqual([DEAN]);
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper']);
        await expect(page.getByRole('link', { name: /View public page/ })).toHaveAttribute(
            'href',
            '/departments/cit#org-chart',
        );
        await expect(page.getByRole('button', { name: 'Add member' }).first()).toBeVisible();
    });

    test('adds members through the card quick actions', async ({ page }) => {
        await openChart(page, ids.cit);
        await addFromCard(page, DEAN, 'report', MGR, 'E2E manager');
        await expect(page.getByTestId('member-count')).toHaveText('6 members');
        await addFromCard(page, MGR, 'report', ALBA, 'E2E one');
        await addFromCard(page, ALBA, 'peer', BETA, 'E2E two');
        await addFromCard(page, ALBA, 'peer', CORA, 'E2E three', true);

        // A peer is slotted right after the card it was added beside.
        await expect.poll(() => reports(page, MGR)).toEqual([ALBA, CORA, BETA]);
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper', MGR]);
        await page.reload();
        expect(await reports(page, MGR)).toEqual([ALBA, CORA, BETA]);
    });

    test('renames a card inline and rejects an empty name', async ({ page }) => {
        await openChart(page, ids.cit);
        await card(page, ALBA).getByTestId('member-name').dblclick();
        const input = page.getByRole('textbox', { name: `Rename ${ALBA}` });
        await expect(input).toBeFocused();

        const renamed = page.waitForResponse(isAction('update'));
        await input.fill(ALBA_RENAMED);
        await input.press('Enter');
        await renamed;
        await expect(card(page, ALBA_RENAMED)).toBeVisible();

        // Escape abandons the edit.
        await card(page, ALBA_RENAMED).getByTestId('member-name').dblclick();
        const again = page.getByRole('textbox', { name: `Rename ${ALBA_RENAMED}` });
        await again.fill('Discarded');
        await again.press('Escape');
        await expect(card(page, ALBA_RENAMED)).toBeVisible();
        await expect(page.getByText('Discarded')).toHaveCount(0);

        await page.reload();
        await expect(card(page, ALBA_RENAMED)).toBeVisible();
    });

    test('search highlights matches and Enter focuses the card', async ({ page }) => {
        await openChart(page, ids.cit);
        await page.getByRole('searchbox', { name: /Search members/ }).fill(MGR);
        await expect(page.getByTestId('search-count')).toHaveText('1 match');
        await expect(card(page, MGR)).toHaveClass(/match/);
        await expect(card(page, DEAN)).toHaveClass(/dim/);
        await page.getByRole('searchbox', { name: /Search members/ }).press('Enter');
        await expect(item(page, MGR)).toBeFocused();
    });

    test('keyboard zoom: + − and 0, and the zoom buttons', async ({ page }) => {
        await openChart(page, ids.cit);
        await fit(page);
        const level = page.getByTestId('zoom-level');
        const before = parseInt((await level.textContent())!, 10);
        await item(page, DEAN).focus();
        await page.keyboard.press('+');
        await expect(level).not.toHaveText(`${before}%`);
        const zoomed = parseInt((await level.textContent())!, 10);
        expect(zoomed).toBeGreaterThan(before);
        await page.keyboard.press('-');
        await page.keyboard.press('-');
        expect(parseInt((await level.textContent())!, 10)).toBeLessThan(zoomed);
        await page.keyboard.press('0');
        await expect(level).toHaveText(`${before}%`);
        await page.getByRole('button', { name: 'Zoom in' }).click();
        expect(parseInt((await level.textContent())!, 10)).toBeGreaterThan(before);
    });

    test('drag a card onto another to change its manager', async ({ page }) => {
        await openChart(page, ids.cit);
        await fit(page);
        await saving(page, () => card(page, CORA).dragTo(card(page, BETA)));
        expect(await reports(page, MGR)).toEqual([ALBA_RENAMED, BETA]);
        expect(await reports(page, BETA)).toEqual([CORA]);
        await expect(page.getByTestId('org-announcer')).toContainText(`${CORA} moved to position 1 of 1 under ${BETA}`);

        await page.reload();
        expect(await reports(page, BETA)).toEqual([CORA]);
    });

    test('keyboard: Alt+Arrow moves a card and announces it', async ({ page }) => {
        await openChart(page, ids.cit);
        const announcer = page.getByTestId('org-announcer');

        await item(page, CORA).focus();
        await saving(page, () => page.keyboard.press('Alt+ArrowLeft'));
        expect(await reports(page, MGR)).toEqual([ALBA_RENAMED, BETA, CORA]);
        await expect(announcer).toContainText(`${CORA} moved to position 3 of 3 under ${MGR}`);
        await expect(item(page, CORA)).toBeFocused();

        await saving(page, () => page.keyboard.press('Alt+ArrowUp'));
        expect(await reports(page, MGR)).toEqual([ALBA_RENAMED, CORA, BETA]);
        await expect(announcer).toContainText('position 2 of 3');

        await saving(page, () => page.keyboard.press('Alt+ArrowRight'));
        expect(await reports(page, ALBA_RENAMED)).toEqual([CORA]);
        expect(await reports(page, MGR)).toEqual([ALBA_RENAMED, BETA]);
        await expect(announcer).toContainText(`${CORA} moved to position 1 of 1 under ${ALBA_RENAMED}`);

        // Nothing earlier to swap with: announced, not applied.
        await page.keyboard.press('Alt+ArrowUp');
        await expect(announcer).toContainText(`${CORA} cannot move earlier among its siblings.`);

        await page.reload();
        expect(await reports(page, ALBA_RENAMED)).toEqual([CORA]);
    });

    test('drag between siblings reorders; undo and redo replay the change', async ({ page }) => {
        await openChart(page, ids.cit);
        await fit(page);
        await saving(page, () =>
            card(page, BETA).dragTo(card(page, ALBA_RENAMED), { targetPosition: { x: 5, y: 20 } }),
        );
        expect(await reports(page, MGR)).toEqual([BETA, ALBA_RENAMED]);

        await saving(page, () => page.keyboard.press('Control+z'));
        expect(await reports(page, MGR)).toEqual([ALBA_RENAMED, BETA]);
        await saving(page, () => page.keyboard.press('Control+Shift+z'));
        expect(await reports(page, MGR)).toEqual([BETA, ALBA_RENAMED]);

        await saving(page, () => page.getByRole('button', { name: 'Undo' }).click());
        expect(await reports(page, MGR)).toEqual([ALBA_RENAMED, BETA]);
        await saving(page, () => page.getByRole('button', { name: 'Redo' }).click());

        await page.reload();
        expect(await reports(page, MGR)).toEqual([BETA, ALBA_RENAMED]);
    });

    test('dropping on the root lane makes a member top-level; cycles are refused', async ({ page }) => {
        await openChart(page, ids.cit);
        await fit(page);

        // Cycle: the manager cannot be dropped onto its own descendant.
        const target = card(page, CORA);
        await card(page, MGR).hover();
        await page.mouse.down();
        await target.hover();
        const box = (await target.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
        await expect(target).toHaveClass(/drop-deny/);
        await expect(page.getByTestId('root-lane')).toBeVisible();
        await page.mouse.up();
        expect(await reports(page, DEAN)).toContain(MGR);

        // Root lane.
        // The lane only exists once the drag has started, so drive the mouse by hand.
        await saving(page, async () => {
            await card(page, MGR).hover();
            await page.mouse.down();
            const from = (await card(page, MGR).boundingBox())!;
            await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 3 });
            const lane = page.getByTestId('root-lane');
            await expect(lane).toBeVisible();
            const to = (await lane.boundingBox())!;
            await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
            await expect(lane).toHaveClass(/over/);
            await page.mouse.up();
        });
        expect(await roots(page)).toEqual([DEAN, MGR]);
        await saving(page, () => page.keyboard.press('Alt+ArrowRight'));
        expect(await roots(page)).toEqual([DEAN]);
        expect(await reports(page, DEAN)).toContain(MGR);
    });

    test('persists on reload and shows on the public department page', async ({ page, browser }) => {
        await openChart(page, ids.cit);
        expect(await reports(page, MGR)).toEqual([BETA, ALBA_RENAMED]);
        expect(await reports(page, ALBA_RENAMED)).toEqual([CORA]);

        expect(await publicReports(browser, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper', MGR]);
        expect(await publicReports(browser, MGR)).toEqual([BETA, ALBA_RENAMED]);
        expect(await publicReports(browser, ALBA_RENAMED)).toEqual([CORA]);
    });

    test('inspector edits the manager and the order', async ({ page }) => {
        await openChart(page, ids.cit);
        await card(page, BETA).click();
        const inspector = page.getByTestId('member-inspector');
        await expect(inspector.getByLabel('Full name')).toHaveValue(BETA);
        await expect(inspector.getByLabel('Reports to')).toHaveValue(
            (await item(page, MGR).getAttribute('data-member-id')) ?? '',
        );
        // The member itself and its descendants are not offered as managers.
        await expect(inspector.getByLabel('Reports to').locator('option', { hasText: BETA })).toHaveCount(0);

        const updated = page.waitForResponse(isAction('update'));
        await inspector.getByLabel('Role / position title').fill('E2E edited role');
        await inspector.getByRole('button', { name: 'Save changes' }).click();
        await updated;
        await expect(card(page, BETA)).toContainText('E2E edited role');
    });

    test('deleting a manager moves its reports up, and survives a reload', async ({ page, browser }) => {
        await openChart(page, ids.cit);

        await card(page, ALBA_RENAMED).hover();
        await page.getByRole('button', { name: `Delete ${ALBA_RENAMED}` }).click();
        await confirmDelete(page, new RegExp(`direct report will move up to ${MGR}`));
        expect(await reports(page, MGR)).toEqual([BETA, CORA]);
        await page.reload();
        expect(await reports(page, MGR)).toEqual([BETA, CORA]);

        await item(page, MGR).focus();
        await page.keyboard.press('Delete');
        await confirmDelete(page, new RegExp(`2 direct reports will move up to ${DEAN}`));
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper', BETA, CORA]);
        expect(await publicReports(browser, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper', BETA, CORA]);

        for (const name of [BETA, CORA]) {
            await fit(page);
            await card(page, name).hover();
            await page.getByRole('button', { name: `Delete ${name}` }).click();
            await confirmDelete(page, /no direct reports/);
        }
        await expect(page.getByTestId('member-count')).toHaveText('5 members');
        await page.reload();
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper']);
    });

    test('reorder validates membership and cycles on the server', async ({ page }) => {
        await openChart(page, ids.cit);
        const idOf = async (name: string) => Number(await item(page, name).getAttribute('data-member-id'));
        const dean = await idOf(DEAN);
        const head = await idOf('Dr. Alan Turing');
        const post = (data: unknown) => page.request.post('/_actions/members.reorder', { data });

        const foreign = await post({
            departmentId: Number(ids.cit),
            placements: [{ id: 999_999, parentId: null, order: 1 }],
        });
        expect(foreign.status()).toBe(400);
        const cycle = await post({
            departmentId: Number(ids.cit),
            placements: [{ id: dean, parentId: head, order: 1 }],
        });
        expect(cycle.status()).toBe(400);
        const badParent = await post({
            departmentId: Number(ids.cit),
            placements: [{ id: head, parentId: 999_999, order: 1 }],
        });
        expect(badParent.status()).toBe(400);
        const ok = await post({ departmentId: Number(ids.cit), placements: [{ id: head, parentId: dean, order: 1 }] });
        expect(ok.status()).toBe(200);
    });

    test('has no serious axe violations (light, dark, inspector open)', async ({ page }) => {
        for (const scheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme: scheme });
            await openChart(page, ids.cit);
            await card(page, DEAN).click();
            await expect(page.getByTestId('member-inspector')).toBeVisible();
            await card(page, DEAN).hover();
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
                .analyze();
            const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        }
    });

    test('narrow screens fall back to an indented vertical tree without zoom controls', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await openChart(page, ids.cit);
        await expect(page.getByRole('button', { name: 'Zoom in' })).toBeHidden();
        const dean = (await card(page, DEAN).boundingBox())!;
        const child = (await card(page, 'Dr. Alan Turing').boundingBox())!;
        expect(child.y).toBeGreaterThan(dean.y);
        expect(child.x).toBeGreaterThan(dean.x);
    });
});

test.describe('org chart editor (department user)', () => {
    test.use({ storageState: CIT });

    test('edits their own department: add via toolbar, then delete from the inspector', async ({ page }) => {
        await openChart(page, ids.cit);
        await card(page, DEAN).click();
        await page.getByRole('button', { name: 'Add member', exact: true }).first().click();
        const inspector = page.getByTestId('member-inspector');
        await expect(inspector.getByLabel('Reports to')).toHaveValue(
            (await item(page, DEAN).getAttribute('data-member-id')) ?? '',
        );
        await inspector.getByLabel('Full name').fill(DEPT);
        await inspector.getByLabel('Role / position title').fill('E2E department role');
        const created = page.waitForResponse(isAction('create'));
        await inspector.getByRole('button', { name: 'Add member' }).click();
        await created;
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper', DEPT]);

        await saving(page, () =>
            item(page, DEPT)
                .focus()
                .then(() => page.keyboard.press('Alt+ArrowUp')),
        );
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', DEPT, 'Dr. Grace Hopper']);

        await page.getByTestId('member-inspector').getByRole('button', { name: 'Delete' }).click();
        await confirmDelete(page);
        expect(await reports(page, DEAN)).toEqual(['Dr. Alan Turing', 'Dr. Grace Hopper']);
    });

    test('cannot open or reorder another department chart', async ({ page }) => {
        expect((await page.goto(`/admin/departments/${ids.cba}/members`))?.status()).toBe(403);
        const response = await page.request.post('/_actions/members.reorder', {
            data: { departmentId: Number(ids.cba), placements: [{ id: 1, parentId: null, order: 1 }] },
        });
        expect(response.status()).toBe(403);
        const del = await page.request.post('/_actions/members.delete', {
            data: { departmentId: Number(ids.cba), id: 1 },
        });
        expect(del.status()).toBe(403);
    });
});
