import { defineConfig, devices } from '@playwright/test';

// E2E_PORT / E2E_DIST let several runs coexist (each gets its own server, DB, uploads and build dir).
const PORT = Number(process.env.E2E_PORT ?? 4399);
const DIST = process.env.E2E_DIST ?? 'dist';
const DB = `storage/e2e-${PORT}.db`;
const UPLOADS = `storage/e2e-uploads-${PORT}`;

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
        // Fresh, seeded SQLite DB and upload dir per run so tests never write into the dev database.
        command: `node -e "const fs=require('node:fs');fs.rmSync('${DB}',{force:true});fs.rmSync('${UPLOADS}',{recursive:true,force:true})" && prisma migrate deploy && tsx prisma/seed.ts && node ${DIST}/server/entry.mjs`,
        port: PORT,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            SITE_URL: `http://localhost:${PORT}`,
            BETTER_AUTH_URL: `http://localhost:${PORT}`,
            DATABASE_URL: `file:./${DB}`,
            STORAGE_DRIVER: 'local',
            UPLOAD_DIR: `./${UPLOADS}`,
        },
    },
});
