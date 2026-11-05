// @ts-check
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { VIDEO_MAX_BYTES } from './src/lib/video-types.ts';
import { BASE_CSP_DIRECTIVES } from './src/lib/server/request-policy.ts';

// Vercel builds (VERCEL=1 during `vercel build`, or ASTRO_ADAPTER=vercel) emit `.vercel/output`; everything else is a Node server.
const useVercel = Boolean(process.env.VERCEL) || process.env.ASTRO_ADAPTER === 'vercel';

// Node behind a reverse proxy: comma-separated public hostnames (build time). Only for these hosts does
// Astro trust X-Forwarded-Host/-Proto/-For, so per-IP rate limits see real clients. Leave unset when
// the server is reachable directly: anyone could then forge X-Forwarded-For.
const allowedDomains = (process.env.ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean)
    .map((hostname) => ({ hostname }));

/**
 * CSP source for an inline script or event-handler attribute with exactly this text.
 * @param {string} text
 * @returns {`sha256-${string}`}
 */
const sha256 = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;

// The theme bootstrap is the one inline script we write ourselves (BaseLayout imports the same file with
// `?raw`). Astro hashes the scripts it generates (island hydration, bundled modules); this one is added by hand.
const themeInitHash = sha256(readFileSync(new URL('./src/scripts/theme-init.js', import.meta.url), 'utf8'));
// Svelte renders `<img onload="this.__e=event" onerror="this.__e=event">` for images with load handlers, so a
// load that happens before hydration is replayed. Only this exact handler is allowed as an attribute.
const svelteImgEventHash = sha256('this.__e=event');

// The Node adapter's static file handler (`send`) answers `public/` files with `max-age=0`; only `/_astro/*` gets a
// long cache. Give the other files one day. Applied to the adapter source while bundling; the build fails loudly if
// an adapter update changes the code this relies on.
const STATIC_HEADERS_ANCHOR = 'stream.on("stream", () => {';
const publicFileCache = {
    name: 'sic-public-file-cache',
    enforce: /** @type {const} */ ('pre'),
    /**
     * @param {string} code
     * @param {string} id
     */
    transform(code, id) {
        if (!id.endsWith('@astrojs/node/dist/serve-static.js')) return null;
        if (!code.includes(STATIC_HEADERS_ANCHOR)) {
            throw new Error('publicFileCache: @astrojs/node/dist/serve-static.js changed; update astro.config.mjs.');
        }
        return code.replace(
            STATIC_HEADERS_ANCHOR,
            `stream.on("headers", (headerRes) => {
        if (!normalizedPathname.startsWith(\`/\${app.manifest.assetsDir}/\`)) headerRes.setHeader("Cache-Control", "public, max-age=86400");
      });
      ${STATIC_HEADERS_ANCHOR}`,
        );
    },
};

export default defineConfig({
    site: process.env.SITE_URL ?? 'http://localhost:4321',
    output: 'server',
    adapter: useVercel
        ? vercel()
        : node({
              mode: 'standalone',
              // Applies to every request body, including the streamed local video PUT (up to VIDEO_MAX_BYTES), the
              // largest upload. Everything else is smaller: actions are capped by `actionBodySizeLimit` below, images
              // by their own limits. 1 MB of headroom lets an upload just over its limit reach the readable size check
              // instead of being cut off; Astro's default (1 GB) would let any client stream gigabytes at a route.
              bodySizeLimit: VIDEO_MAX_BYTES + 1024 * 1024,
          }),
    trailingSlash: 'never',
    integrations: [svelte()],
    // Actions accept multipart uploads: the largest is a Download (LIMITS.download, 20 MB) on the local
    // driver. Astro's default is 1 MB. The headroom lets a slightly larger file reach the action's own
    // size check and its readable message. On Vercel the platform caps bodies at ~4.5 MB anyway.
    security: {
        checkOrigin: true,
        allowedDomains,
        actionBodySizeLimit: 24 * 1024 * 1024,
        // Scripts may only be same-origin files or inline scripts Astro hashed at build time (island
        // hydration, bundled modules) plus the theme bootstrap; no `unsafe-inline`, so an injected
        // `<script>` or `onclick=` does not run. Pages send it as a header (the other directives
        // come from `request-policy.ts`, which also covers non-page responses). Styles stay inline-
        // friendly: components position slide layers with `style=` attributes.
        csp: {
            algorithm: 'SHA-256',
            directives: [...BASE_CSP_DIRECTIVES],
            scriptDirective: {
                hashes: [themeInitHash, { hash: svelteImgEventHash, kind: 'attribute' }],
                resources: [{ resource: "'unsafe-hashes'", kind: 'attribute' }],
            },
            styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
        },
    },
    // ClientRouter would prefetch every link by default; admin pages are `no-store`, so prefetched
    // HTML could never be reused. Keep prefetch opt-in (`data-astro-prefetch`).
    prefetch: { prefetchAll: false },
    vite: {
        plugins: useVercel ? [tailwindcss()] : [tailwindcss(), publicFileCache],
        // `src/middleware.ts` compresses and tags responses only where the platform does not (Node).
        define: { __NODE_SERVER__: JSON.stringify(!useVercel) },
        // `cropperjs` is only loaded through a dynamic import() in ImageCropper.svelte. Pre-bundle it at
        // dev startup so Vite does not re-optimize mid-session and answer 504 "Outdated Optimize Dep".
        optimizeDeps: { include: ['cropperjs'] },
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
