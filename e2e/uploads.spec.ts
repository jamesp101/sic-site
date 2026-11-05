import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIResponse, type Page } from '@playwright/test';

import { ADMIN } from './auth-state';
import { UPLOADS } from './env';

const DOWNLOADS = path.resolve(UPLOADS, 'downloads');
const MB = 1024 * 1024;

test.use({ storageState: ADMIN });

const listDownloads = () => new Set(fs.existsSync(DOWNLOADS) ? fs.readdirSync(DOWNLOADS) : []);

/** Action results are devalue-serialised: `{ id: 5 }` arrives as `[{"id":1},5]`. */
async function resultId(response: APIResponse): Promise<number> {
    const [root, ...values] = (await response.json()) as [{ id: number }, ...unknown[]];
    return values[root.id - 1] as number;
}

async function createDownload(page: Page, name: string, size: number) {
    await page.goto('/admin/downloads');
    return page.request.post('/_actions/downloads.create', {
        headers: { Origin: new URL(page.url()).origin },
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
    expect(created.ok(), await created.text()).toBe(true);
    const id = await resultId(created);

    // Other specs may upload in parallel; only this test writes a 19 MB file.
    const stored = [...listDownloads()].find(
        (file) => !before.has(file) && fs.statSync(path.join(DOWNLOADS, file)).size === size,
    );
    expect(stored, 'the file is written under UPLOAD_DIR/downloads').toBeTruthy();

    const served = await page.request.head(`/storage/downloads/${stored}`);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-length']).toBe(String(size));

    const deleted = await page.request.post('/_actions/downloads.delete', {
        headers: { Origin: new URL(page.url()).origin },
        data: { id },
    });
    expect(deleted.ok(), await deleted.text()).toBe(true);
    expect(fs.existsSync(path.join(DOWNLOADS, stored!))).toBe(false);
});

test('local driver rejects a download over 20 MB with the size message and stores nothing', async ({ page }) => {
    const size = 21 * MB;
    const response = await createDownload(page, `Too large ${Date.now().toString(36)}`, size);
    expect(response.ok()).toBe(false);
    expect(await response.text()).toContain('must not be larger than 20 MB');
    const oversized = [...listDownloads()].filter((file) => fs.statSync(path.join(DOWNLOADS, file)).size === size);
    expect(oversized).toEqual([]);
});
