import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

/** Unique per run so retries and other specs never collide with the rows a spec creates. */
export const RUN = Date.now().toString(36);

/** A small real image every uploader accepts. */
export const SEAL = path.resolve('public/sic-seal.png');
export const SEAL_BYTES = fs.readFileSync(SEAL);

/** A signed-out visitor's page with JavaScript disabled: what the server-rendered HTML alone shows. Close it with `page.context().close()`. */
export async function visitorPage(browser: Browser): Promise<Page> {
    const context = await browser.newContext({ javaScriptEnabled: false });
    return context.newPage();
}

/** Resolves once the island of `component` has hydrated (Astro removes `ssr` from the island element). */
export const islandHydrated = (page: Page, component: string) =>
    page.waitForFunction(
        (name) => !!document.querySelector(`astro-island[component-url*="${name}"]:not([ssr])`),
        component,
    );

/** Clicks `trigger` until `expected` shows: the click is ignored while its island is still hydrating. */
export const clickUntilVisible = (trigger: Locator, expected: Locator) =>
    expect(async () => {
        await trigger.click({ timeout: 2000 });
        await expect(expected).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
