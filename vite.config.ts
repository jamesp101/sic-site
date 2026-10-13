// Vite+ only: lint, fmt, test, staged and tasks. Astro owns dev/build through
// astro.config.mjs, so this file is never used to serve or build the app.
import { defineConfig } from 'vite-plus';

const generated = ['src/generated/**', 'dist/**', '.astro/**', 'prisma/schema.prisma', 'prisma/migrations/**'];

export default defineConfig({
    lint: {
        ignorePatterns: generated,
        options: { typeAware: true, typeCheck: true },
        overrides: [{ files: ['**/*.svelte'], rules: { 'no-undef': 'off' } }],
    },
    fmt: {
        singleQuote: true,
        printWidth: 120,
        ignorePatterns: [...generated, '**/*.astro', 'pnpm-lock.yaml', '.claude/**', 'skills-lock.json'],
    },
    test: {
        include: ['src/**/*.test.ts'],
        env: { DATABASE_URL: 'file:./storage/test.db' },
    },
    staged: {
        '*.{ts,js,mjs,svelte,css,json,md}': 'vp check --fix',
        '*.astro': 'prettier --write',
    },
    run: {
        tasks: {
            // First-run bootstrap used by `devenv up` / `devenv test`: schema, client, migrations, seed (only when empty).
            setup: {
                // astro sync generates .astro/ types (astro:env, actions) that type checks need on a fresh clone.
                command:
                    'node scripts/prisma-schema.mjs && prisma generate && prisma migrate deploy && tsx prisma/seed.ts --if-empty && astro sync',
                cache: false,
            },
            dev: { command: 'astro dev', cache: false },
            build: { command: 'astro build', cache: false },
            preview: { command: 'node dist/server/entry.mjs', cache: false },
            'check:templates': { command: 'astro check && svelte-check --tsconfig ./tsconfig.json', cache: false },
            'fmt:astro': { command: 'prettier --check "src/**/*.astro"', cache: false },
            'db:schema': { command: 'node scripts/prisma-schema.mjs && prisma generate', cache: false },
            'db:migrate': { command: 'node scripts/prisma-schema.mjs && prisma migrate dev', cache: false },
            'db:deploy': { command: 'node scripts/prisma-schema.mjs && prisma migrate deploy', cache: false },
            'db:seed': { command: 'tsx prisma/seed.ts', cache: false },
            'db:reset': { command: 'node scripts/prisma-schema.mjs && prisma migrate reset --force', cache: false },
            'db:create-admin': { command: 'tsx prisma/create-admin.ts', cache: false },
            'db:studio': { command: 'prisma studio', cache: false },
            e2e: { command: 'playwright test', dependsOn: ['build'], cache: false },
            ci: {
                command:
                    'astro sync && vp check && vp run fmt:astro && vp run check:templates && vp test && vp run e2e',
                cache: false,
            },
        },
    },
});
