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
        command: 'node dist/server/entry.mjs',
        port: PORT,
        reuseExistingServer: !process.env.CI,
        env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            SITE_URL: `http://localhost:${PORT}`,
            BETTER_AUTH_URL: `http://localhost:${PORT}`,
        },
    },
});
