# Request policy, CSP, compression and caching

`src/lib/server/request-policy.ts` owns the route classes, the login redirect and the response headers; `src/middleware.ts` applies it (and assigns the request context: `auth-admin.md`).

## Request policy

- A signed-out call to any action except `contact.send` gets 401 before the body is read (`rejectsAnonymousAction`). A new public action must be added to `PUBLIC_ACTIONS` in `request-policy.ts`.
- Any other signed-out request that can carry a body (not GET/HEAD) gets 413 unless `Content-Length` is present and at most 64 KB (`rejectsLargeAnonymousBody`). Uploads and actions need a session, so nothing is exempt.
- Private routes are `noindex` (`X-Robots-Tag`) and `no-store`.
- Better Auth routes the app does not use are disabled in `DISABLED_PATHS` (`auth.ts`).
- Sign-in limits: `auth-admin.md`.

## CSP

`security.csp` in `astro.config.mjs` allows scripts from `'self'` and Astro's build-time hashes only, plus two hand-hashed entries: `src/scripts/theme-init.js` (inlined by `BaseLayout`) and Svelte's `this.__e=event` img handler. An inline script or `on*=` attribute needs its own hash: `e2e/security.spec.ts` fails on any CSP violation. Pages rendered by Astro send the shared directives through `security.csp.directives`; every other response (API, endpoints, redirects, errors) gets them from `responseHeaders` (`BASE_CSP_DIRECTIVES`).

## Caching and compression

- Anonymous GET responses for public pages get `PUBLIC_CACHE_CONTROL` (`public, max-age=60, s-maxage=60, stale-while-revalidate=600`); private routes, signed-in users and non-GET requests get `no-store`. The policy adds no `Cache-Control` to `/_astro/` and `/storage/` assets (the storage route sets its own).
- On Node the middleware also tags public HTML with a weak ETag (304) and gzip/brotli-compresses text (`http-edge.ts`, `__NODE_SERVER__` from the config). Only public HTML is buffered for its ETag; every other text response streams through the compressor. Vercel does both itself.

## Adapter and deployment

`@astrojs/node` standalone by default; `@astrojs/vercel` when `VERCEL` is set or `ASTRO_ADAPTER=vercel` (`astro.config.mjs`). `vercel.json` builds with `node scripts/prisma-schema.mjs && prisma generate && astro build` and never migrates: CI runs `prisma migrate deploy` first. The app runs as serverless functions: no in-process state (see `AGENTS.md`).
