import { expect, test as setup } from '@playwright/test';
import { DEMO_USERS, seedPassword } from '../prisma/demo-data';
import { ADMIN, CIT } from './auth-state';

// Sign in once per role and reuse the cookies: sign-in is rate limited to 5/min per IP.
const USERS = [
    { file: ADMIN, email: DEMO_USERS.superAdmin.email, password: seedPassword('SEED_SUPERADMIN_PASSWORD') },
    { file: CIT, email: DEMO_USERS.cit.email, password: seedPassword('SEED_DEPARTMENT_PASSWORD') },
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
