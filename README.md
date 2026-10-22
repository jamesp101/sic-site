# San Isidro College — website (Astro)

Full-stack Astro port of the Laravel/Inertia site. Server-rendered for SEO, Svelte islands only where interaction is needed.

Stack: Astro 7 (`output: 'server'`, Node standalone, or the Vercel adapter on Vercel) · Svelte 5 islands · Tailwind v4 · Prisma 7 (SQLite in dev; MySQL/MariaDB or PostgreSQL by URL) · Better Auth · Astro Actions · uploads on local disk or S3 · Vite+ (`vp`) for lint/format/test/tasks · devenv for the toolchain.

## Quick start

Requires [devenv](https://devenv.sh) (Nix). Everything else (Node 24, pnpm, Prisma engines, Playwright browsers) comes from `devenv.nix`.

| Goal                                                                                           | Command        |
| ---------------------------------------------------------------------------------------------- | -------------- |
| Run the site (installs deps, renders schema, migrates, seeds on first run, starts `astro dev`) | `devenv up`    |
| Run every check: format, lint, types, template types, unit tests, build, e2e                   | `devenv test`  |
| Shell with the toolchain                                                                       | `devenv shell` |

Site: <http://localhost:4321>. Seeded logins: `admin@sic.edu.ph` (superadmin), `cit@sic.edu.ph`, `cba@sic.edu.ph` (department users); passwords come from `SEED_SUPERADMIN_PASSWORD` / `SEED_DEPARTMENT_PASSWORD` in `.env` (created from `.env.example`).

## Daily commands (inside `devenv shell`)

| Task                                                                                                           | Command                                                   |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Dev server                                                                                                     | `vp run dev`                                              |
| Format + lint + TS types                                                                                       | `vp check` (`--fix` to apply)                             |
| `.astro` / `.svelte` template types                                                                            | `vp run check:templates`                                  |
| Unit tests                                                                                                     | `vp test`                                                 |
| Production build / serve                                                                                       | `vp run build` / `vp run preview`                         |
| E2E (Playwright, builds first)                                                                                 | `vp run e2e`                                              |
| Everything CI runs                                                                                             | `vp run ci`                                               |
| New migration after editing `prisma/schema.base.prisma`                                                        | `vp run db:migrate`                                       |
| Apply migrations / seed / reset                                                                                | `vp run db:deploy` / `vp run db:seed` / `vp run db:reset` |
| Sample schools: 5 departments, 20 posts and 7–15 members each (recreate: `tsx prisma/seed-schools.ts --reset`) | `vp run db:seed:schools`                                  |
| Create or reset a superadmin                                                                                   | `ADMIN_EMAIL=… ADMIN_NAME=… vp run db:create-admin`       |
| Prisma Studio                                                                                                  | `vp run db:studio`                                        |

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

Legacy Laravel `/storage/...` links keep working with every driver. `?download=<name>` always streams through the app so the attachment name applies. Switching drivers does not move existing files: copy `UPLOAD_DIR` into the bucket under `S3_PREFIX` with the same keys (e.g. `aws s3 sync storage/uploads s3://<bucket>/<prefix>`).

Uploads are only stored and served as the types in `src/lib/server/file-types.ts` (raster images, PDF, text/CSV, Office documents, ZIP): `put` derives extension and content type from that list, never from the browser's declared type, and the storage route sets the type from the extension with a sandboxing CSP (PDFs excepted) and sends anything else as an `application/octet-stream` attachment. Uploads not yet attached to a record (inline images, layer images, presigned URLs) are rate-limited per user.

### Large uploads on Vercel

Vercel functions reject request bodies over ~4.5 MB, so with `STORAGE_DRIVER=s3`:

- **Downloads (up to 20 MB)** are uploaded by the browser straight to the bucket with a presigned PUT URL. `POST /api/admin/uploads/direct` (`{ fileName, contentType, size }`) requires a signed-in user, checks the type (`file-types.ts` allowlist) and size (20 MB), and returns a server-generated `downloads/<random>.<ext>` key plus a 10-minute URL with the content type and length signed in. The key is recorded in `pending_uploads` as issued to that user; `downloads.create` receives `uploadedKey` instead of the file, claims it (only the issuing user, once, within an hour) and checks the stored size with `HeadObject`. Keys never claimed are deleted with their objects by later direct-upload requests. The admin form picks this path from a server flag (`directUploads`); `local` keeps the multipart path.
- **Bucket CORS**: the browser PUTs cross-origin, so the bucket needs a rule like `[{"AllowedOrigins":["https://<site>"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]` (`aws s3api put-bucket-cors`, or the provider's CORS settings).
- **Images** stay multipart: they are compressed to WebP in the browser first, and `LIMITS.image` is lowered to 4 MB on `s3`, so an oversized pass-through file (GIF, or a browser without WebP encoding) gets a clear validation message instead of a platform 413. The server converts every accepted image to WebP inside its size box (sharp, `src/lib/server/image-webp.ts`), keeping already-compressed WebP untouched.

## Deploying to Vercel

Vercel runs the app with the Vercel adapter (selected when `VERCEL` is set during `vercel build`, or with `ASTRO_ADAPTER=vercel`; `vercel.json` sets the build command `node scripts/prisma-schema.mjs && prisma generate && astro build`). The server keeps no state on disk: toasts use a short-lived httpOnly cookie (`sic_flash`), auth rate limits live in the `auth_rate_limits` table, uploads go to S3.

1. **Database (Neon)**: add the Neon integration to the Vercel project. Runtime `DATABASE_URL` is the **pooled** connection string (`postgresql://…-pooler…`). Migrations are not run by Vercel; CI runs `prisma migrate deploy` with the **direct** (non-pooled) URL before deploying, and `vercel.json` disables Vercel's Git deployments (`git.deploymentEnabled: false`) so nothing ships ahead of migrations.
2. **S3 bucket**: create a bucket (AWS S3 or an S3-compatible service such as Cloudflare R2) and an access key limited to it (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`). Add the CORS rule above for the production origin. Optionally make it public-read behind a CDN and set `S3_PUBLIC_URL`; otherwise files stream through `/storage/*`.
3. **Environment variables** (Production): `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ random chars), `BETTER_AUTH_URL` and `SITE_URL` (the public origin), `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT` (non-AWS), `S3_FORCE_PATH_STYLE`, `S3_PREFIX`, `S3_PUBLIC_URL`, and `MAIL_MAILER=smtp` with `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `CONTACT_TO_ADDRESS`.
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
