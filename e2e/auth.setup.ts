import { expect, test as setup } from '@playwright/test';
import { ADMIN, CIT } from './auth-state';

// Sign in once per role and reuse the cookies: sign-in is rate limited to 5/min per IP.
const USERS = [
    {
        file: ADMIN,
        email: 'admin@sic.edu.ph',
        password: process.env.SEED_SUPERADMIN_PASSWORD ?? 'password',
    },
    { file: CIT, email: 'cit@sic.edu.ph', password: process.env.SEED_DEPARTMENT_PASSWORD ?? 'password' },
];

for (const user of USERS) {
    setup(`sign in ${user.email}`, async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel(/email/i).fill(user.email);
        await page.getByLabel(/^password$/i).fill(user.password);
        await page.getByRole('button', { name: /log in|sign in/i }).click();
        await expect(page).toHaveURL(/\/dashboard/);
        await page.context().storageState({ path: user.file });
    });
}
