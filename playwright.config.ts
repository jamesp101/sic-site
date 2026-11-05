import { defineConfig, devices } from '@playwright/test';
import { DATABASE_URL, PORT, UPLOADS } from './e2e/env';

// E2E_DIST lets several runs coexist with E2E_PORT (see e2e/env.ts): each gets its own build dir.
const DIST = process.env.E2E_DIST ?? 'dist';

// Every run starts from an empty, migrated, seeded database and upload dir, so tests never write into dev data.
const prepare = `node -e "require('node:fs').rmSync('${UPLOADS}',{recursive:true,force:true})" && tsx e2e/reset-db.ts && node scripts/prisma-schema.mjs && prisma migrate deploy && tsx prisma/seed.ts`;

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    // All workers share one Node server (SSR + uploads + editors); more than 3 starves it and
    // turns hydration waits into flaky timeouts.
    workers: process.env.CI ? 2 : 3,
    timeout: 60_000,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
    projects: [
        { name: 'setup', testMatch: /auth\.setup\.ts/ },
        { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    ],
    webServer: {
        // The build must have been made for the same provider as the database (see e2e/env.ts).
        command: `${prepare} && node ${DIST}/server/entry.mjs`,
        port: PORT,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            SITE_URL: `http://localhost:${PORT}`,
            BETTER_AUTH_URL: `http://localhost:${PORT}`,
            DATABASE_URL,
            STORAGE_DRIVER: 'local',
            UPLOAD_DIR: `./${UPLOADS}`,
        },
    },
});
