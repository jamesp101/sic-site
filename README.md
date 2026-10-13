# San Isidro College — website (Astro)

Full-stack Astro port of the Laravel/Inertia site. Server-rendered for SEO, Svelte islands only where interaction is needed.

Stack: Astro 7 (`output: 'server'`, Node standalone, or the Vercel adapter on Vercel) · Svelte 5 islands · Tailwind v4 · Prisma 7 (SQLite in dev; MySQL/MariaDB or PostgreSQL by URL) · Better Auth · Astro Actions · uploads on local disk, S3 or Vercel Blob · Vite+ (`vp`) for lint/format/test/tasks · devenv for the toolchain.

## Quick start

Requires [devenv](https://devenv.sh) (Nix). Everything else (Node 24, pnpm, Prisma engines, Playwright browsers) comes from `devenv.nix`.

| Goal                                                                                           | Command        |
| ---------------------------------------------------------------------------------------------- | -------------- |
| Run the site (installs deps, renders schema, migrates, seeds on first run, starts `astro dev`) | `devenv up`    |
| Run every check: format, lint, types, template types, unit tests, build, e2e                   | `devenv test`  |
| Shell with the toolchain                                                                       | `devenv shell` |

Site: <http://localhost:4321>. Seeded logins: `admin@email.com` (superadmin), `cit@sic.edu`, `cba@sic.edu` (department users); passwords come from `SEED_SUPERADMIN_PASSWORD` / `SEED_DEPARTMENT_PASSWORD` in `.env` (created from `.env.example`).

## Daily commands (inside `devenv shell`)

| Task                                                    | Command                                                   |
| ------------------------------------------------------- | --------------------------------------------------------- |
| Dev server                                              | `vp run dev`                                              |
| Format + lint + TS types                                | `vp check` (`--fix` to apply)                             |
| `.astro` / `.svelte` template types                     | `vp run check:templates`                                  |
| Unit tests                                              | `vp test`                                                 |
| Production build / serve                                | `vp run build` / `vp run preview`                         |
| E2E (Playwright, builds first)                          | `vp run e2e`                                              |
| Everything CI runs                                      | `vp run ci`                                               |
| New migration after editing `prisma/schema.base.prisma` | `vp run db:migrate`                                       |
| Apply migrations / seed / reset                         | `vp run db:deploy` / `vp run db:seed` / `vp run db:reset` |
| Create or reset a superadmin                            | `ADMIN_EMAIL=… ADMIN_NAME=… vp run db:create-admin`       |
| Prisma Studio                                           | `vp run db:studio`                                        |

`vp` is the project-local Vite+ CLI (`pnpm exec vp` outside devenv). Astro owns dev/build, so they run as tasks (`vp run dev`), never `vp dev`.

## Database

- Edit `prisma/schema.base.prisma` only. `scripts/prisma-schema.mjs` renders the gitignored `prisma/schema.prisma` with the provider taken from `DATABASE_URL` (`file:` → sqlite, `mysql://`/`mariadb://` → mysql, `postgres(ql)://` → postgresql) and runs on install and every `db:*` task.
- Runtime picks the matching driver adapter (`src/lib/server/db.ts`): better-sqlite3, mariadb or pg.
- Migrations are provider-specific: `prisma/migrations/<provider>/`. Switching provider = set `DATABASE_URL`, then `vp run db:migrate` to create that provider's baseline.
- Table and column names match the Laravel schema; Better Auth uses its own `auth_sessions`, `auth_accounts`, `auth_verifications` and `auth_rate_limits` (shared rate-limit counters) tables.

## Visual block editor

Posts, hero sections and the landing page setting (`welcome_hero_content`) are edited with the visual block editor (`src/components/admin/editor/`): Elements palette, Layers tree, a canvas that renders the real site styles in an iframe, and an Inspector. Departments still use the Markdown editor.

- **Storage**: a versioned JSON document `{"type":"sic-blocks","version":1,"blocks":[…]}` in the existing text columns (no migration). Anything else in those columns is legacy Markdown / MDX-lite: it keeps rendering through `parseMarkdown`, opens in the editor as one "Markdown (legacy)" block and can be converted to blocks. An untouched legacy value is saved back unchanged.
- **Code**: `src/lib/blocks/` is pure TypeScript shared by the editor, the server and tests: `types.ts` (model and limits), `schema.ts` (zod validation; `checkContent` is used by the post/hero/settings actions through `src/lib/server/content-field.ts`), `render.ts` (semantic HTML with token classes, all text escaped, URLs filtered, headings h2–h4), `content.ts` (`renderContent`, used by every public caller), `plain-text.ts` (excerpts via `toPlainText`), `from-markdown.ts`, `templates.ts`.
- **Editor shortcuts**: Delete removes, Ctrl/Cmd+D duplicates, Ctrl/Cmd+Z and Shift+Z undo / redo, Alt+arrows move or re-parent, arrows change the selection, Enter edits text, Esc deselects. In Layers, focus a row, press Space to lift, arrows to move, Space to drop.
- **Inline text markup** (paragraphs, lists, table cells, …): `**bold**`, `*italic*`, `[label](url)`; `\` escapes a character.

## Uploads

`STORAGE_DRIVER` selects the backend (see `.env.example`); code only talks to `src/lib/server/storage` (`put`, `remove`, `read`, `publicUrl`, `downloadUrl`), and the database stores bare keys (`posts/abc.jpg`).

| `STORAGE_DRIVER`  | Where files live                                                                                                                             | URLs                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `local` (default) | `UPLOAD_DIR` on the server disk (default `storage/uploads`)                                                                                  | `/storage/<key>`, streamed by `src/pages/storage/[...path].ts`                                                                                 |
| `s3`              | `S3_BUCKET` on AWS S3 or any S3-compatible service (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true` for self-hosted ones such as Garage/SeaweedFS) | `/storage/<key>` streamed from the bucket; with `S3_PUBLIC_URL` set, `<S3_PUBLIC_URL>/<key>` directly and `/storage/<key>` 301-redirects there |
| `vercel-blob`     | A public Vercel Blob store (`BLOB_READ_WRITE_TOKEN`, optional `BLOB_PREFIX`)                                                                 | `<BLOB_PUBLIC_BASE_URL>/<key>` directly (required); `/storage/<key>` 301-redirects there                                                       |

Legacy Laravel `/storage/...` links keep working with every driver. `?download=<name>` always streams through the app (also for `vercel-blob`) so the attachment name applies. Switching drivers does not move existing files: copy `UPLOAD_DIR` into the bucket under `S3_PREFIX` with the same keys (e.g. `aws s3 sync storage/uploads s3://<bucket>/<prefix>`).

### Large uploads on Vercel

Vercel functions reject request bodies over ~4.5 MB, so with `STORAGE_DRIVER=vercel-blob`:

- **Downloads (up to 20 MB)** are uploaded by the browser straight to Blob (`@vercel/blob/client` `upload()`). The server only hands out the right to do so: `POST /api/admin/uploads/blob` requires a signed-in user, issues a server-generated `downloads/<random>.<ext>` key with a signed, 10-minute ticket bound to the user and key (`type: 'issue-key'`), and `handleUpload` then issues a client token only for that exact pathname, limited to documents/archives/images and 20 MB. The `downloads.create` action receives `uploadedKey` instead of the file, validates the key shape and checks it exists with `head()` (size comes from Blob, not from the client). The admin form picks this path from a server flag (`directUploads`); local/s3 keep the multipart path.
- **Images** stay multipart: they are compressed to WebP in the browser first, and `LIMITS.image` is lowered to 4 MB on `vercel-blob`, so an oversized pass-through file (GIF/SVG, or a browser without WebP encoding) gets a clear validation message instead of a platform 413.

## Deploying to Vercel

Vercel runs the app with the Vercel adapter (selected when `VERCEL` is set during `vercel build`, or with `ASTRO_ADAPTER=vercel`; `vercel.json` sets the build command `node scripts/prisma-schema.mjs && prisma generate && astro build`). The server keeps no state on disk: toasts use a short-lived httpOnly cookie (`sic_flash`), auth rate limits live in the `auth_rate_limits` table, uploads go to Blob.

1. **Database (Neon)**: add the Neon integration to the Vercel project. Runtime `DATABASE_URL` is the **pooled** connection string (`postgresql://…-pooler…`). Migrations are not run by Vercel; CI runs `prisma migrate deploy` with the **direct** (non-pooled) URL before deploying, and `vercel.json` disables Vercel's Git deployments (`git.deploymentEnabled: false`) so nothing ships ahead of migrations.
2. **Blob**: create a Blob store (public) and connect it to the project; this adds `BLOB_READ_WRITE_TOKEN`. Copy the store's public base URL into `BLOB_PUBLIC_BASE_URL` (`https://<id>.public.blob.vercel-storage.com`).
3. **Environment variables** (Production): `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ random chars), `BETTER_AUTH_URL` and `SITE_URL` (the public origin), `STORAGE_DRIVER=vercel-blob`, `BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_BASE_URL`, optional `BLOB_PREFIX`, and `MAIL_MAILER=smtp` with `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `CONTACT_TO_ADDRESS`.
4. **First admin**: nothing is seeded in production. Run once from a machine with the direct database URL:

    ```sh
    DATABASE_URL='<direct postgres url>' ADMIN_EMAIL=you@example.com ADMIN_NAME='Your Name' \
      pnpm exec tsx prisma/create-admin.ts          # prompts for the password (no echo)
    ```

    `ADMIN_PASSWORD` may be set instead of the prompt (minimum 12 characters, never printed). Running it again for an existing email resets that user's password, makes them superadmin and signs out their sessions.

Existing files are not moved: upload them to the store under the same keys (e.g. with the Vercel CLI or a script using `@vercel/blob`) before switching drivers. Vercel's function bundle also contains the unused SQLite driver; it is only loaded when `DATABASE_URL` is a `file:` URL.

## SEO

Per-page title/description/canonical/Open Graph/Twitter via `BaseLayout` props (`src/components/seo/Seo.astro`), JSON-LD (`CollegeOrUniversity`, `WebSite`, `BreadcrumbList`, `NewsArticle`, `Event`), dynamic `/sitemap.xml`, `/robots.txt`, `/rss.xml`, `noindex` + `no-store` on private routes, public `Cache-Control` on public pages.

## Toolchain spike results (plan Phase 1)

1. `vp --version`: Vite 8.3.3, Vitest 5.0.3, Oxfmt 0.72; `vp run build` produces `dist/server/entry.mjs`.
2. `vp check` runs Oxfmt + Oxlint (type-aware) on `.ts`/`.svelte`; `.astro` is formatted by Prettier (`vp run fmt:astro`).
3. `vp test` runs tests that import modules without `astro:*` imports (authz, storage, password, markdown, slug).
4. Code under test stays free of `astro:*` imports; `astro:actions` usage is isolated in `src/lib/server/action-guard.ts` and `src/actions/*`.
5. NixOS: Prisma has no prebuilt engines for NixOS; `devenv.nix` points `PRISMA_SCHEMA_ENGINE_BINARY` at `pkgs.prisma-engines_7` (keep its version equal to the `prisma` devDependency). Playwright browsers come from `pkgs.playwright-driver` (keep `@playwright/test` pinned to the same version).
