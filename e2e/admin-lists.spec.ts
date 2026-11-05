import { expect, test, type Page } from '@playwright/test';

import { ADMIN } from './auth-state';

const RUN = `Paged ${Date.now().toString(36)}`;
const TOTAL = 27;
const title = (n: number) => `${RUN} ${String(n).padStart(2, '0')}`;
const listUrl = `/admin/posts?q=${encodeURIComponent(RUN)}&sort=title&dir=asc`;
const rows = (page: Page) => page.locator('main tbody tr');

test.use({ storageState: ADMIN });
test.describe.configure({ mode: 'serial' });

test('admin posts list is paginated and deletes rows through the one shared dialog', async ({ page }) => {
    test.slow();
    await page.goto('/admin/posts');
    const origin = new URL(page.url()).origin;
    const ids: number[] = [];
    try {
        // Sequential: concurrent creates would race for unique slugs.
        for (let n = 1; n <= TOTAL; n++) {
            const created = await page.request.post('/_actions/posts.create', {
                headers: { Origin: origin },
                multipart: { title: title(n), content: 'Paged body.', type: 'article', isFeatured: 'false' },
            });
            expect(created.ok(), await created.text()).toBe(true);
            // Action results are devalue-serialised: `{ id: 5 }` arrives as `[{"id":1},5]`.
            const [root, ...values] = (await created.json()) as [{ id: number }, ...number[]];
            ids.push(values[root.id - 1]);
        }

        await page.goto(listUrl);
        await expect(rows(page)).toHaveCount(25);
        await expect(rows(page).first()).toContainText(title(1));
        // One island for the whole list instead of one per row.
        expect(await page.locator('astro-island[component-url*="RowDeleteDialog"]').count()).toBe(1);
        const pager = page.getByRole('navigation', { name: 'Posts pages' });
        await pager.getByRole('link', { name: 'Page 2' }).click();
        await expect(page).toHaveURL(/[?&]page=2/);
        await expect(rows(page)).toHaveCount(TOTAL - 25);
        await expect(rows(page).first()).toContainText(title(26));

        // Cancel returns focus to the row's button; confirm deletes the row.
        const trigger = page.getByRole('button', { name: `Delete post ${title(26)}` });
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('Delete this post?');
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();

        for (const n of [26, 27]) {
            await page.getByRole('button', { name: `Delete post ${title(n)}` }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
            await expect(page.getByRole('button', { name: `Delete post ${title(n)}` })).toHaveCount(0);
        }
        // Page 2 no longer exists: the list shows the last page instead of an empty one.
        await expect(rows(page)).toHaveCount(25);
        await expect(pager).toHaveCount(0);
    } finally {
        // Remove every post this test created, even after a failure, so other specs see the seeded list.
        // Posts already deleted above answer NOT_FOUND, which is fine here.
        for (const id of ids) {
            await page.request.post('/_actions/posts.delete', { headers: { Origin: origin }, data: { id } });
        }
    }
});
