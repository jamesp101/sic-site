import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, CIT } from './auth-state';
const RUN = Date.now().toString(36);
const LABEL = `Zeta ${RUN}`;
const CHILD = `Eta ${RUN}`;

/** Resolves once the editor island has hydrated (Astro removes `ssr` from the island element). */
const hydrated = (page: Page) =>
    page.waitForFunction(() => !!document.querySelector('astro-island[component-url*="NavLinksEditor"]:not([ssr])'));

async function gotoEditor(page: Page) {
    await page.goto('/admin/navlinks');
    await hydrated(page);
}

async function reloadEditor(page: Page) {
    await page.reload();
    await hydrated(page);
}

const reorderSaved = (page: Page) =>
    page.waitForResponse((r) => r.url().includes('/_actions/navlinks.reorder') && r.ok());

/** Labels of the top-level cards, in page order. */
const topLabels = (page: Page) =>
    page
        .locator('[data-testid="nav-top"]')
        .evaluateAll((els) =>
            els.map((el) => el.querySelector('[data-testid="nav-label"]')?.textContent?.trim() ?? ''),
        );

const childLabels = (page: Page, parent: string) =>
    page
        .locator('[data-testid="nav-top"]', {
            has: page.getByRole('button', { name: new RegExp(`^Reorder ${parent}\\.`) }),
        })
        .locator('[data-testid="nav-child"] [data-testid="nav-label"]')
        .allTextContents();

const handle = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^Reorder ${label}\\.`) });

/** Top-level header labels as server-rendered HTML shows them (no JavaScript). */
async function publicHeader(browser: Browser) {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    const labels = await page
        .locator('#primary-menu > li > a, #primary-menu > li > button')
        .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));
    const nested = await page.locator('#primary-menu li li a').allTextContents();
    await context.close();
    return { labels, nested };
}

/** Opens the "More actions" overflow menu of a row and clicks one item. */
async function rowAction(page: Page, label: string, item: string) {
    await page.getByRole('button', { name: `More actions for ${label}` }).click();
    await page.getByRole('menuitem', { name: item }).click();
}

const card = (page: Page, label: string) =>
    page
        .locator('[data-link-id]', { has: page.getByRole('button', { name: new RegExp(`^Reorder ${label}\\.`) }) })
        .first();

const updateSaved = (page: Page) =>
    page.waitForResponse((r) => r.url().includes('/_actions/navlinks.update') && r.ok());

async function deleteLink(page: Page, label: string) {
    await rowAction(page, label, 'Delete');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('nav-label').filter({ hasText: label })).toHaveCount(0);
}

async function addLink(page: Page, label: string, url: string, parent?: string) {
    if (parent) {
        await rowAction(page, parent, 'Add sub-link');
    } else {
        await page.getByRole('button', { name: 'Add link', exact: true }).click();
    }
    const form = page.getByRole('form', { name: parent ? `Add link under ${parent}` : 'Add link' });
    await form.getByLabel('Label').fill(label);
    await form.getByLabel('URL').fill(url);
    await form.getByRole('button', { name: 'Add link', exact: true }).click();
    await expect(page.getByTestId('nav-label').filter({ hasText: label })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('as superadmin', () => {
    test.use({ storageState: ADMIN });

    test('page is an editor, not a table, with a single h1', async ({ page }) => {
        await gotoEditor(page);
        await expect(page.getByRole('heading', { level: 1, name: 'Navigation links' })).toBeVisible();
        await expect(page.locator('table')).toHaveCount(0);
        await expect(page.getByTestId('nav-top').first()).toBeVisible();
        await expect(page.getByTestId('nav-preview')).toBeVisible();
        await expect(page.getByTestId('nav-summary')).toHaveText(/^\s*\d+ links\s+· \d+ hidden · \d+ warnings?\s*$/);
        // Empty sub-link zones are not drawn when nothing is being dragged.
        await expect(page.locator('ul.nav-children-empty')).toHaveCount(0);
    });

    for (const scheme of ['light', 'dark'] as const) {
        test(`navigation editor has no serious axe violations (${scheme})`, async ({ page }) => {
            test.slow();
            await page.emulateMedia({ colorScheme: scheme });
            await gotoEditor(page);
            await expect(page.getByTestId('nav-top').first()).toBeVisible();
            const scan = async (state: string) => {
                const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
                const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
                expect(
                    serious.map((v) => `${state} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
                ).toEqual([]);
            };
            await scan('idle');
            // With the add form, its suggestion list, an open preview dropdown and an open row menu.
            await page.getByRole('button', { name: 'Add link', exact: true }).click();
            await page.getByRole('form', { name: 'Add link' }).getByLabel('URL').focus();
            await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
            await scan('combobox open');
            await page.keyboard.press('Escape');
            await page
                .getByTestId('nav-preview')
                .getByRole('button', { name: /^Departments/ })
                .click();
            await expect(page.getByRole('button', { name: 'College of Education' })).toBeVisible();
            await scan('preview dropdown open');
            await page.keyboard.press('Escape');
            await page.getByRole('button', { name: 'More actions for Home' }).click();
            await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
            await scan('menu open');
        });
    }

    test('header preview mirrors the site: departments dropdown, parent links, hidden toggle', async ({ page }) => {
        await gotoEditor(page);
        const preview = page.getByTestId('nav-preview');
        await expect(page.locator('#nav-preview-title')).toBeVisible();
        await expect(
            page.locator('section[aria-labelledby="nav-preview-title"] img[src="/sic-seal.png"]'),
        ).toHaveAttribute('alt', '');

        // "#departments" becomes a dropdown of the real departments, not a plain link.
        const departments = preview.getByRole('button', { name: /^Departments/ });
        await departments.click();
        await expect(departments).toHaveAttribute('aria-expanded', 'true');
        const panel = page.locator(`#${await departments.getAttribute('aria-controls')}`);
        await expect(panel.getByRole('button')).toContainText([
            'College of Business Administration',
            'College of Education',
            'College of Information Technology',
        ]);
        await page.keyboard.press('Escape');
        await expect(departments).toBeFocused();
        await expect(departments).toHaveAttribute('aria-expanded', 'false');

        // The list row explains the dropdown and shows the auto type.
        const row = card(page, 'Departments');
        await expect(row.getByTestId('nav-kind').first()).toHaveText('Departments menu (auto)');
        await expect(row).toContainText("Opens a dropdown — its URL isn't used");

        // A parent with sub-links opens a dropdown showing them; clicking an item selects its row.
        const downloads = preview.getByRole('button', { name: /^Downloads/ });
        await downloads.focus();
        await expect(
            page.locator(`#${await downloads.getAttribute('aria-controls')}`).getByRole('button'),
        ).toContainText(['Student Handbook', 'Academic Calendars']);
        await page
            .locator(`#${await downloads.getAttribute('aria-controls')}`)
            .getByRole('button', { name: 'Student Handbook' })
            .click();
        await expect(page.locator('[data-testid="nav-child"]', { hasText: 'Student Handbook' })).toHaveClass(
            /border-brand-600/,
        );
        await preview.getByRole('button', { name: 'Home', exact: true }).click();
        await expect(card(page, 'Home')).toHaveClass(/border-brand-600/);
    });

    test('add a link by picking a department from the combobox suggestions', async ({ page }) => {
        await gotoEditor(page);
        await page.getByRole('button', { name: 'Add link', exact: true }).click();
        const form = page.getByRole('form', { name: 'Add link' });
        const url = form.getByLabel('URL');
        await expect(url).toHaveAttribute('role', 'combobox');
        await expect(url).toHaveAttribute('aria-expanded', 'false');

        // Opens with grouped suggestions.
        await url.focus();
        const list = page.getByRole('listbox', { name: 'Suggestions' });
        await expect(url).toHaveAttribute('aria-expanded', 'true');
        for (const group of ['Pages', 'Departments'])
            await expect(list.getByRole('group', { name: group })).toBeVisible();
        await expect(list.getByRole('option', { name: /Departments menu \(auto\)/ })).toBeVisible();
        await expect(list.getByRole('option', { name: /Contact\s+\/contact/ })).toBeVisible();

        // Typing filters by label and by URL.
        await url.fill('business');
        await expect(list.getByRole('option')).toHaveCount(1);
        await url.fill('/departments/c');
        await expect(list.getByRole('option')).toHaveCount(3);
        await url.fill('administration');
        await expect(list.getByRole('option')).toHaveCount(1);

        // Escape closes the list first and leaves the form open; arrows + Enter pick.
        await page.keyboard.press('Escape');
        await expect(list).toBeHidden();
        await expect(form).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
        await expect(url).toHaveAttribute('aria-activedescendant', /-option-0$/);
        await page.keyboard.press('Enter');
        await expect(url).toHaveValue('/departments/cba');
        await expect(form.getByLabel('Label')).toHaveValue('College of Business Administration');
        await expect(form.getByTestId('nav-kind')).toHaveText('Department');
        await expect(list).toBeHidden();

        // A label typed first is kept; picking with the mouse works too.
        await form.getByLabel('Label').fill(`Pick ${RUN}`);
        await url.fill('coe');
        await list.getByRole('option', { name: /College of Education/ }).click();
        await expect(url).toHaveValue('/departments/coe');
        await expect(form.getByLabel('Label')).toHaveValue(`Pick ${RUN}`);

        await form.getByRole('button', { name: 'Add link', exact: true }).click();
        const added = card(page, `Pick ${RUN}`);
        await expect(added).toBeVisible();
        await expect(added.getByTestId('nav-kind').first()).toHaveText('Department');
        await expect(added.getByTestId('nav-warning')).toHaveCount(0);
        await deleteLink(page, `Pick ${RUN}`);
    });

    test('a broken internal link and a duplicate show warnings that never block saving', async ({ page }) => {
        await gotoEditor(page);
        const broken = `Broken ${RUN}`;
        await addLink(page, broken, `/no-such-page-${RUN}?x=1#y`);
        const row = card(page, broken);
        await expect(row.getByTestId('nav-warning')).toHaveText('Page not found');
        await expect(row.getByTestId('nav-warning')).toHaveAttribute('title', /No page, department or post exists/);
        await expect(page.getByTestId('nav-warnings')).toContainText(`${broken} (page not found)`);
        await expect(page.getByTestId('nav-summary')).toContainText(/\d+ warnings?\s*$/);

        // Known paths (ignoring query/hash) and external URLs are fine; a second visible /contact duplicates.
        const dup = `Dup ${RUN}`;
        await addLink(page, dup, '/contact?ref=nav#top');
        await expect(card(page, dup).getByTestId('nav-warning')).toHaveCount(0);
        const dup2 = `Dup2 ${RUN}`;
        await addLink(page, dup2, '/contact');
        await expect(card(page, dup2).getByTestId('nav-warning')).toHaveText('Duplicate link');
        await expect(card(page, 'Contact Us').getByTestId('nav-warning')).toHaveText('Duplicate link');
        await addLink(page, `Ext ${RUN}`, 'https://example.com/missing');
        await expect(card(page, `Ext ${RUN}`).getByTestId('nav-warning')).toHaveCount(0);
        await expect(card(page, `Ext ${RUN}`).getByTestId('nav-kind').first()).toContainText('External');

        // The summary links select the row.
        await page
            .getByTestId('nav-warnings')
            .getByRole('button', { name: `${broken} (page not found)` })
            .click();
        await expect(row).toHaveClass(/border-brand-600/);
        await expect(handle(page, broken)).toBeFocused();

        for (const label of [broken, dup, dup2, `Ext ${RUN}`]) await deleteLink(page, label);
    });

    test('validates the URL before saving', async ({ page }) => {
        await gotoEditor(page);
        await page.getByRole('button', { name: 'Add link', exact: true }).click();
        const form = page.getByRole('form', { name: 'Add link' });
        await form.getByLabel('Label').fill('Bad');
        await form.getByLabel('URL').fill('javascript:alert(1)');
        await form.getByRole('button', { name: 'Add link', exact: true }).click();
        await expect(form.getByRole('alert')).toContainText('full https:// URL');
        await form.getByRole('button', { name: 'Cancel' }).click();
        await expect(form).toHaveCount(0);
    });

    test('add a link, move it to the top with the keyboard, and the header follows', async ({ page, browser }) => {
        await gotoEditor(page);
        await addLink(page, LABEL, '/zeta-test');
        const initial = await topLabels(page);
        expect(initial).toContain(LABEL);

        await handle(page, LABEL).focus();
        for (let i = 0; i < initial.indexOf(LABEL); i++) {
            const saved = reorderSaved(page);
            await page.keyboard.press('ArrowUp');
            await saved;
            await expect(handle(page, LABEL)).toBeFocused();
        }
        expect((await topLabels(page))[0]).toBe(LABEL);

        await reloadEditor(page);
        expect((await topLabels(page))[0]).toBe(LABEL);
        expect((await publicHeader(browser)).labels[0]).toBe(LABEL);
    });

    test('mouse drag reorders and persists', async ({ page, browser }) => {
        await gotoEditor(page);
        const before = await topLabels(page);
        expect(before[0]).toBe(LABEL);
        const treeBefore = await page.getByTestId('nav-label').allTextContents();

        const grip = await handle(page, LABEL).boundingBox();
        expect(grip).toBeTruthy();
        const saved = reorderSaved(page);
        await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip!.x + 20, grip!.y + 30, { steps: 5 });
        // While dragging, childless parents show a slim drop target; measure the layout only after it appeared.
        await expect(page.locator('ul.nav-children-empty:visible').first()).toBeVisible();
        const lastCard = await page.getByTestId('nav-top').nth(1).boundingBox();
        expect(lastCard).toBeTruthy();
        const dropY = lastCard!.y + 22;
        await page.mouse.move(lastCard!.x + lastCard!.width / 2, dropY - 10, { steps: 25 });
        await page.mouse.move(lastCard!.x + lastCard!.width / 2, dropY, { steps: 5 });
        await page.mouse.up();
        await saved;

        const after = await topLabels(page);
        const tree = () => page.getByTestId('nav-label').allTextContents();
        const treeAfter = await tree();
        // Dropping over a card may also nest the link; either way the tree changed and must persist.
        expect(treeAfter).not.toEqual(treeBefore);
        await reloadEditor(page);
        expect(await tree()).toEqual(treeAfter);
        expect(await topLabels(page)).toEqual(after);
        expect((await publicHeader(browser)).labels.slice(0, after.length)).toEqual(after);
    });

    test('inline rename: double-click or F2, Enter saves, Escape cancels', async ({ page, browser }) => {
        await gotoEditor(page);
        const label = page.getByTestId('nav-label').filter({ hasText: new RegExp(`^${LABEL}$`) });

        // Escape cancels without saving.
        await label.dblclick();
        const input = page.getByRole('textbox', { name: `Rename ${LABEL}` });
        await expect(input).toBeFocused();
        await input.fill('Never saved');
        await page.keyboard.press('Escape');
        await expect(input).toHaveCount(0);
        await expect(label).toBeVisible();
        await expect(handle(page, LABEL)).toBeFocused();

        // Enter saves through navlinks.update.
        const renamed = `${LABEL} renamed`;
        await label.dblclick();
        let saved = updateSaved(page);
        await page.getByRole('textbox', { name: `Rename ${LABEL}` }).fill(renamed);
        await page.keyboard.press('Enter');
        await saved;
        await expect(page.getByTestId('nav-label').filter({ hasText: renamed })).toBeVisible();
        await reloadEditor(page);
        await expect(page.getByTestId('nav-label').filter({ hasText: renamed })).toBeVisible();
        expect((await publicHeader(browser)).labels).toContain(renamed);

        // F2 on the focused handle renames back.
        await handle(page, renamed).focus();
        await page.keyboard.press('F2');
        saved = updateSaved(page);
        await page.getByRole('textbox', { name: `Rename ${renamed}` }).fill(LABEL);
        await page.keyboard.press('Enter');
        await saved;
        await expect(handle(page, LABEL)).toBeFocused();
        await expect(page.getByTestId('nav-label').filter({ hasText: new RegExp(`^${LABEL}$`) })).toBeVisible();
    });

    test('overflow menu is keyboard accessible', async ({ page }) => {
        await gotoEditor(page);
        const trigger = page.getByRole('button', { name: 'More actions for Home' });
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        // Focus moves into the menu onto the first enabled item; arrows move on and never land on a disabled item.
        const focused = page.locator('[role="menuitem"]:focus');
        await expect(focused).toHaveCount(1);
        await expect(focused).toBeEnabled();
        const first = await focused.textContent();
        await page.keyboard.press('ArrowDown');
        await expect(focused).toBeEnabled();
        expect(await focused.textContent()).not.toBe(first);
        await page.keyboard.press('End');
        await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });

    test('nest and un-nest with the keyboard, toggle active, delete', async ({ page, browser }) => {
        await gotoEditor(page);
        if (!(await topLabels(page)).includes(LABEL)) {
            const back = reorderSaved(page);
            await rowAction(page, LABEL, 'Make top-level');
            await back;
        }
        const tops = await topLabels(page);
        const index = tops.indexOf(LABEL);
        // Keep the link where it is but make sure there is a previous top-level link to nest under.
        expect(index).toBeGreaterThan(0);
        const parent = tops[index - 1];

        // Nest: the link above must not be nested itself, which holds for top-level cards.
        await handle(page, LABEL).focus();
        let saved = reorderSaved(page);
        await page.keyboard.press('ArrowRight');
        await saved;
        expect(await childLabels(page, parent)).toContain(LABEL);
        expect((await publicHeader(browser)).nested).toContain(LABEL);

        // Un-nest puts it right after its parent again.
        await expect(handle(page, LABEL)).toBeFocused();
        saved = reorderSaved(page);
        await page.keyboard.press('ArrowLeft');
        await saved;
        const afterUnnest = await topLabels(page);
        expect(afterUnnest.indexOf(LABEL)).toBe(afterUnnest.indexOf(parent) + 1);

        // A parent that has children cannot become a child.
        await addLink(page, CHILD, '/eta-test', LABEL);
        await page.getByRole('button', { name: `More actions for ${LABEL}` }).click();
        await expect(page.getByRole('menuitem', { name: 'Make sub-link of the link above' })).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toHaveCount(0);

        // Hidden links leave the public header.
        saved = updateSaved(page);
        await page.getByRole('switch', { name: `Visible in navigation: ${LABEL}` }).click();
        await saved;
        await expect(page.getByRole('switch', { name: `Visible in navigation: ${LABEL}` })).toHaveAttribute(
            'aria-checked',
            'false',
        );
        await reloadEditor(page);
        await expect(page.getByRole('switch', { name: `Visible in navigation: ${LABEL}` })).toHaveAttribute(
            'aria-checked',
            'false',
        );
        expect((await publicHeader(browser)).labels).not.toContain(LABEL);

        // Hidden is stated in text (not only dimmed) and the preview omits the link unless "Show hidden" is on.
        const row = card(page, LABEL);
        await expect(row.getByTestId('nav-hidden-badge').first()).toHaveText('Hidden');
        const preview = page.getByTestId('nav-preview');
        await expect(preview.getByRole('button', { name: LABEL })).toHaveCount(0);
        await page.getByRole('switch', { name: 'Show hidden' }).check();
        const ghost = preview.getByRole('button', { name: new RegExp(`^${LABEL}\\s*Hidden$`) });
        await expect(ghost).toBeVisible();
        await ghost.click();
        await expect(row).toHaveClass(/border-brand-600/);
        await page.getByRole('switch', { name: 'Show hidden' }).uncheck();
        await expect(preview.getByRole('button', { name: LABEL })).toHaveCount(0);

        // Undo/redo of order changes.
        await handle(page, LABEL).focus();
        const before = await topLabels(page);
        saved = reorderSaved(page);
        await page.keyboard.press('ArrowDown');
        await saved;
        expect(await topLabels(page)).not.toEqual(before);
        saved = reorderSaved(page);
        await page.getByRole('button', { name: 'Undo' }).click();
        await saved;
        expect(await topLabels(page)).toEqual(before);

        // Delete the parent (and its child) via the confirm dialog.
        await deleteLink(page, LABEL);
        await expect(page.getByTestId('nav-label').filter({ hasText: CHILD })).toHaveCount(0);
        const header = await publicHeader(browser);
        expect(header.labels).not.toContain(LABEL);
        expect(header.nested).not.toContain(CHILD);
    });
});

test.describe('as department user', () => {
    test.use({ storageState: CIT });

    test('cannot open or call the navigation editor', async ({ page }) => {
        expect((await page.goto('/admin/navlinks'))?.status()).toBe(403);
        const response = await page.request.post('/_actions/navlinks.reorder', {
            data: { items: [{ id: 1, parentId: null, order: 1 }] },
        });
        expect(response.status()).toBe(403);
    });
});
