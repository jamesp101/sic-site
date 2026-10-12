import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/posts', '/downloads', '/contact', '/departments/cit', '/login'];

for (const scheme of ['light', 'dark'] as const) {
    for (const path of PAGES) {
        test(`${path} has no serious axe violations (${scheme})`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: scheme });
            await page.goto(path);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
                .analyze();
            const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        });
    }
}

test('skip link moves focus to main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('a[href="#main"]');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
});
