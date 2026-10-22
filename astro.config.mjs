// @ts-check
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import 'dotenv/config';

// Vercel builds (VERCEL=1 during `vercel build`, or ASTRO_ADAPTER=vercel) emit `.vercel/output`; everything else is a Node server.
const useVercel = Boolean(process.env.VERCEL) || process.env.ASTRO_ADAPTER === 'vercel';

export default defineConfig({
    site: process.env.SITE_URL ?? 'http://localhost:4321',
    output: 'server',
    adapter: useVercel ? vercel() : node({ mode: 'standalone' }),
    trailingSlash: 'never',
    integrations: [svelte()],
    security: { checkOrigin: true },
    // ClientRouter would prefetch every link by default; admin pages are `no-store`, so prefetched
    // HTML could never be reused. Keep prefetch opt-in (`data-astro-prefetch`).
    prefetch: { prefetchAll: false },
    vite: {
        plugins: [tailwindcss()],
        ssr: { external: ['better-sqlite3', '@prisma/adapter-better-sqlite3'] },
    },
    env: {
        schema: {
            SITE_URL: envField.string({ context: 'server', access: 'public', default: 'http://localhost:4321' }),
            PUBLIC_APP_NAME: envField.string({ context: 'client', access: 'public', default: 'San Isidro College' }),
            DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
            STORAGE_DRIVER: envField.enum({
                context: 'server',
                access: 'secret',
                values: ['local', 's3'],
                default: 'local',
            }),
            UPLOAD_DIR: envField.string({ context: 'server', access: 'secret', default: './storage/uploads' }),
            S3_BUCKET: envField.string({ context: 'server', access: 'secret', optional: true }),
            S3_REGION: envField.string({ context: 'server', access: 'secret', optional: true }),
            S3_ENDPOINT: envField.string({ context: 'server', access: 'secret', optional: true }),
            S3_ACCESS_KEY_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
            S3_SECRET_ACCESS_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            S3_FORCE_PATH_STYLE: envField.boolean({ context: 'server', access: 'secret', default: false }),
            S3_PREFIX: envField.string({ context: 'server', access: 'secret', optional: true }),
            S3_PUBLIC_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
            BETTER_AUTH_SECRET: envField.string({ context: 'server', access: 'secret' }),
            BETTER_AUTH_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
            MAIL_MAILER: envField.enum({
                context: 'server',
                access: 'secret',
                values: ['log', 'smtp'],
                default: 'log',
            }),
            MAIL_HOST: envField.string({ context: 'server', access: 'secret', optional: true }),
            MAIL_PORT: envField.number({ context: 'server', access: 'secret', default: 587 }),
            MAIL_USERNAME: envField.string({ context: 'server', access: 'secret', optional: true }),
            MAIL_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
            MAIL_FROM_ADDRESS: envField.string({ context: 'server', access: 'secret', default: 'noreply@sic.edu.ph' }),
            CONTACT_TO_ADDRESS: envField.string({ context: 'server', access: 'secret', default: 'info@sic.edu.ph' }),
        },
    },
});
