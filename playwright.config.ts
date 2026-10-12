import { defineConfig, devices } from '@playwright/test';

const PORT = 4399;

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
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
        command:
            "node -e \"require('node:fs').rmSync('storage/e2e.db',{force:true});require('node:fs').rmSync('storage/e2e-uploads',{recursive:true,force:true})\" && prisma migrate deploy && tsx prisma/seed.ts && node dist/server/entry.mjs",
        port: PORT,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            SITE_URL: `http://localhost:${PORT}`,
            BETTER_AUTH_URL: `http://localhost:${PORT}`,
            DATABASE_URL: 'file:./storage/e2e.db',
            STORAGE_DRIVER: 'local',
            UPLOAD_DIR: './storage/e2e-uploads',
        },
    },
});
