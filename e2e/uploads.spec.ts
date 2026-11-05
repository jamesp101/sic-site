import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { postAction } from './actions';
import { ADMIN } from './auth-state';
import { UPLOADS } from './env';
import { islandHydrated } from './support';

const DOWNLOADS = path.resolve(UPLOADS, 'downloads');
const MB = 1024 * 1024;

test.use({ storageState: ADMIN });

const listDownloads = () => new Set(fs.existsSync(DOWNLOADS) ? fs.readdirSync(DOWNLOADS) : []);

async function createDownload(page: Page, name: string, size: number) {
    await page.goto('/admin/downloads');
    return postAction<{ id: number }>(page, 'downloads.create', {
        multipart: {
            fileName: name,
            file: { name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 0x25) },
        },
    });
}

test('local driver stores a multipart download up to the 20 MB limit on disk, serves it and deletes it', async ({
    page,
}) => {
    const size = 19 * MB;
    const before = listDownloads();

    const created = await createDownload(page, `Large ${Date.now().toString(36)}`, size);
    expect(created.ok, created.text).toBe(true);
    const { id } = created.data;

    // Other specs may upload in parallel; only this test writes a 19 MB file.
    const stored = [...listDownloads()].find(
        (file) => !before.has(file) && fs.statSync(path.join(DOWNLOADS, file)).size === size,
    );
    expect(stored, 'the file is written under UPLOAD_DIR/downloads').toBeTruthy();

    const served = await page.request.head(`/storage/downloads/${stored}`);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-length']).toBe(String(size));

    const deleted = await postAction(page, 'downloads.delete', { json: { id } });
    expect(deleted.ok, deleted.text).toBe(true);
    expect(fs.existsSync(path.join(DOWNLOADS, stored!))).toBe(false);
});

test('local driver rejects a download over 20 MB with the size message and stores nothing', async ({ page }) => {
    const size = 21 * MB;
    const response = await createDownload(page, `Too large ${Date.now().toString(36)}`, size);
    expect(response.ok).toBe(false);
    expect(response.text).toContain('must not be larger than 20 MB');
    const oversized = [...listDownloads()].filter((file) => fs.statSync(path.join(DOWNLOADS, file)).size === size);
    expect(oversized).toEqual([]);
});

test('downloads details drawer takes focus, keeps it inside and gives it back on Escape', async ({ page }) => {
    const name = `Drawer ${Date.now().toString(36)}`;
    const created = await createDownload(page, name, 1024);
    expect(created.ok, created.text).toBe(true);
    try {
        await page.goto(`/admin/downloads?q=${encodeURIComponent(name)}`);
        await islandHydrated(page, 'DownloadsManager');
        const trigger = page.getByRole('button', { name: new RegExp(`Details for ${name}`) });
        await trigger.click();
        const drawer = page.getByRole('dialog', { name: 'File details' });
        await expect(drawer).toBeVisible();
        await expect(drawer.locator(':focus')).toHaveCount(1);

        for (let i = 0; i < 8; i++) {
            await page.keyboard.press('Tab');
            await expect(drawer.locator(':focus')).toHaveCount(1);
        }

        await page.keyboard.press('Escape');
        await expect(drawer).toBeHidden();
        await expect(trigger).toBeFocused();
    } finally {
        await postAction(page, 'downloads.delete', { json: { id: created.data.id } });
    }
});
