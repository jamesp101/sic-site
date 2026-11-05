# San Isidro College — website (Astro)

Full-stack Astro port of the Laravel/Inertia site. Server-rendered for SEO, Svelte islands only where interaction is needed.

Stack: Astro 7 (`output: 'server'`, Node standalone, or the Vercel adapter on Vercel) · Svelte 5 islands · Tailwind v4 · Prisma 7 (MariaDB in dev via devenv; MySQL/MariaDB, PostgreSQL or SQLite by URL) · Better Auth · Astro Actions · uploads on local disk or S3 · Vite+ (`vp`) for lint/format/test/tasks · devenv for the toolchain.

## Quick start

Requires [devenv](https://devenv.sh) (Nix). Everything else (Node 24, pnpm, MariaDB 11.4, Prisma engines, Playwright browsers) comes from `devenv.nix`.

| Goal                                                                                                           | Command        |
| -------------------------------------------------------------------------------------------------------------- | -------------- |
| Run the site (starts MariaDB, installs deps, renders schema, migrates, seeds on first run, starts `astro dev`) | `devenv up`    |
| Run every check: format, lint, types, template types, unit tests, build, e2e (on a throwaway SQLite file)      | `devenv test`  |
| Shell with the toolchain                                                                                       | `devenv shell` |

Site: <http://localhost:4321>. Seeded logins: `admin@sic.edu.ph` (superadmin), `cit@sic.edu.ph`, `cba@sic.edu.ph` (department users); passwords come from `SEED_SUPERADMIN_PASSWORD` / `SEED_DEPARTMENT_PASSWORD` in `.env` (created from `.env.example`).

`devenv up` refuses to start when port 3306 is already taken (`strict_ports: true` in `devenv.yaml`), for example by a system MariaDB/MySQL or another project's `devenv up`. Stop whatever holds the port (`ss -ltnp 'sport = :3306'` shows it) and run `devenv up` again. Do not edit the port: `.env.example` and the e2e databases expect 3306.

## Daily commands (inside `devenv shell`)

| Task                                                                                                                   | Command                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Dev server                                                                                                             | `vp run dev`                                              |
| Format + lint + TS types                                                                                               | `vp check` (`--fix` to apply)                             |
| `.astro` / `.svelte` template types                                                                                    | `vp run check:templates`                                  |
| Unit tests                                                                                                             | `vp test`                                                 |
| Production build / serve                                                                                               | `vp run build` / `vp run preview`                         |
| E2E (Playwright, builds first)                                                                                         | `vp run e2e`                                              |
| Everything CI runs                                                                                                     | `vp run ci`                                               |
| New migration after editing `prisma/schema.base.prisma`                                                                | `vp run db:migrate`                                       |
| Apply migrations / seed / reset                                                                                        | `vp run db:deploy` / `vp run db:seed` / `vp run db:reset` |
| Sample schools: 5 departments, 20 posts and 7–15 members each (recreate: `tsx prisma/seed-schools.ts --reset`)         | `vp run db:seed:schools`                                  |
| Recompute post / hero-section search text (once after `db:deploy` added `search_text`)                                 | `vp run db:backfill-search`                               |
| Create the missing image variants of existing Highlight images and Slide photos (once after deploying; safe to repeat) | `vp run storage:variants`                                 |
| Copy an SQLite database into the empty, migrated `DATABASE_URL` database (default source `storage/dev.db`)             | `vp run db:copy` (`-- --from file:./other.db`)            |
| Create or reset a superadmin                                                                                           | `ADMIN_EMAIL=… ADMIN_NAME=… vp run db:create-admin`       |
| Prisma Studio                                                                                                          | `vp run db:studio`                                        |

`vp` is the project-local Vite+ CLI (`pnpm exec vp` outside devenv). Astro owns dev/build, so they run as tasks (`vp run dev`), never `vp dev`.

## Database

- Edit `prisma/schema.base.prisma` only. `scripts/prisma-schema.mjs` renders the gitignored `prisma/schema.prisma` with the provider taken from `DATABASE_URL` (`file:` → sqlite, `mysql://`/`mariadb://` → mysql, `postgres(ql)://` → postgresql) and runs on install and every `db:*` task.
- Runtime picks the matching driver adapter (`src/lib/server/db.ts`): better-sqlite3, mariadb or pg.
- MariaDB/MySQL connection pool: `connectionLimit` defaults to 5 per process (`MYSQL_POOL_SIZE` in `src/lib/server/db.ts`); override it with `DATABASE_POOL_SIZE=<n>` or `?connectionLimit=<n>` in `DATABASE_URL`. Measured on the dev data (production build, 10 concurrent requests, all 14 benchmark routes, a CPU-contended machine): mean p95 was 212 ms with 5 connections, 273 ms with 10 and 425 ms with 20, so a larger pool only adds contention here. Keep `instances × pool size` below the server's `max_connections` (151 by default on MariaDB); on serverless every function instance has its own pool, so use 1–3 or a pooling proxy.
- Migrations are provider-specific: `prisma/migrations/<provider>/` (sqlite, mysql, postgresql); a schema change gets a migration in each.
- MySQL column types: `{{longtext}}` columns are LONGTEXT, `{{text}}` columns (URLs, user agents, tokens) TEXT, every other String VARCHAR(255). The `search_text` columns use a literal `DEFAULT ''` on LONGTEXT, which MariaDB (10.2+, devenv runs 11.4) accepts and Oracle MySQL 8 rejects: use MariaDB.
- Dev runs on the MariaDB from `devenv up` (`mysql://sic:sic@127.0.0.1:3306/sic`, data in `.devenv/state/mysql`). To bring an existing SQLite dev database across: `devenv up` (or `devenv up mysql`), `vp run db:deploy`, then `vp run db:copy` (refuses a target that already has rows; uploads stay where they are). Back to SQLite: set `DATABASE_URL="file:./storage/dev.db"` and run `vp run db:schema`.
- Tests never touch the dev database: unit tests use a temporary SQLite file with their own client (`src/generated/prisma-sqlite`, generated by `src/lib/server/sqlite-client.mjs`); e2e uses `storage/e2e-<port>.db` or, on MariaDB, a `<db>_e2e_<port>` database that `e2e/reset-db.ts` recreates each run. `devenv test` and the first CI job run on SQLite; CI also runs build + e2e on PostgreSQL and MariaDB. `devenv test` leaves the app client generated for SQLite: `devenv up` regenerates it, otherwise run `vp run db:schema` before `vp run dev`.
- `posts.search_text` and `hero_sections.search_text` hold the plain text of `content` for search and are filled on save. Deploy note: after `prisma migrate deploy` applies `search_text`, run `vp run db:backfill-search` once so existing rows become searchable.
- Table and column names match the Laravel schema; Better Auth uses its own `auth_sessions`, `auth_accounts`, `auth_verifications` and `auth_rate_limits` (shared rate-limit counters) tables.

## Visual block editor

Posts, hero sections and the landing page setting (`welcome_hero_content`) are edited with the visual block editor (`src/components/admin/editor/`): Elements palette, Layers tree, a canvas that renders the real site styles in an iframe, and an Inspector. Departments still use the Markdown editor.

- **Storage**: a versioned JSON document `{"type":"sic-blocks","version":1,"blocks":[…]}` in the existing text columns (no migration). Anything opening with `{"type":"sic-blocks"` is a block document (a broken one renders empty and is rejected on save); anything else is legacy Markdown / MDX-lite: it keeps rendering through `parseMarkdown`, opens in the editor as one "Markdown (legacy)" block and can be converted to blocks. An untouched legacy value is saved back unchanged.
- **Code**: `src/lib/blocks/` is pure TypeScript shared by the editor, the server and tests: `types.ts` (model and limits), `schema.ts` (zod validation), `render.ts` (semantic HTML with token classes, all text escaped, URLs filtered, headings h2–h4), `content.ts` (`parseContent`: the one place that classifies blocks vs. Markdown; `renderContent`, `toPlainText`, `excerptOf` and `checkContent` for every caller, `checkContent` via `src/lib/server/content-field.ts`), `plain-text.ts`, `from-markdown.ts`, `templates.ts`.
- **Editor rules**: the editor's tree rules are pure commands in `src/lib/blocks/edit.ts` (`resolveDrop` is the one placement decision behind palette, canvas-chip and Layers drags; also `canDrop`, `insertNew`, `deleteBlock`, `indentBlock`, `outdentBlock`, `convertMarkdown`), built on the tree operations of `document.ts`. `src/components/admin/editor/session.ts` (`EditorSession`) owns blocks, history, selection and the value to save; `BlockEditor.svelte` only renders and wires the DOM.
- **Editor shortcuts**: Delete removes, Ctrl/Cmd+D duplicates, Ctrl/Cmd+Z and Shift+Z undo / redo, Alt+arrows move or re-parent, arrows change the selection, Enter edits text, Esc deselects. In Layers, focus a row, press Space to lift, arrows to move, Space to drop.
- **Inline text markup** (paragraphs, lists, table cells, …): `**bold**`, `*italic*`, `[label](url)`; `\` escapes a character.
- **Media blocks**: _Image_ takes an upload or a pasted https image URL, with an optional click-through link (external links open in a new tab). _Album_ holds up to 48 images (upload several at once, reorder, alt text and caption each) and opens in an accessible lightbox on public pages: a native modal dialog with Esc, arrow keys, on-screen buttons, swipe and an "n of m" counter, driven by `src/scripts/lightbox.ts`; without JavaScript each thumbnail is a plain link to the full image. _Video_ takes a YouTube or Vimeo link, or an uploaded MP4/WebM (up to 100 MB; with `s3` the browser uploads straight to the bucket), played with the native player. The editor canvas shows a placeholder instead of the player.

## Uploads

`STORAGE_DRIVER` selects the backend (see `.env.example`); code only talks to `src/lib/server/storage` (`put`, `remove`, `read`, `publicUrl`, `downloadUrl`), and the database stores bare keys (`posts/abc.jpg`).

| `STORAGE_DRIVER`  | Where files live                                                                                                                             | URLs                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `local` (default) | `UPLOAD_DIR` on the server disk (default `storage/uploads`)                                                                                  | `/storage/<key>`, streamed by `src/pages/storage/[...path].ts`                                                                                 |
| `s3`              | `S3_BUCKET` on AWS S3 or any S3-compatible service (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true` for self-hosted ones such as Garage/SeaweedFS) | `/storage/<key>` streamed from the bucket; with `S3_PUBLIC_URL` set, `<S3_PUBLIC_URL>/<key>` directly and `/storage/<key>` 301-redirects there |

Legacy Laravel `/storage/...` links keep working with every driver. `?download=<name>` always streams through the app so the attachment name applies. Switching drivers does not move existing files: copy `UPLOAD_DIR` into the bucket under `S3_PREFIX` with the same keys (e.g. `aws s3 sync storage/uploads s3://<bucket>/<prefix>`).

Highlight images have a second, 640 px wide WebP next to the original under `<key without extension>.w640.webp` (e.g. `posts/abc.webp` → `posts/abc.w640.webp`), and Slide photos a 960 px one (`carousels/abc.w960.webp`). Post cards and the Post hero use the Highlight variant in a `srcset`, the first paint of the Hero carousel the Slide one; it is written in the same `commitWithFiles` commit as the original, removed when the original is replaced or deleted, and kept or deleted together with it by `storage:cleanup`. A variant that does not exist yet (images uploaded before variants) is not an error: `/storage/<variant>` serves the original instead. After deploying, run `vp run storage:variants` once to create the missing variants of existing images (safe to repeat). The variant URL always goes through the app route, also with `S3_PUBLIC_URL`, so the fallback keeps working; the route then redirects to the bucket.

Uploads are only stored and served as the types in `src/lib/server/file-types.ts` (raster images, PDF, text/CSV, Office documents, ZIP, MP4/WebM video): `put` derives extension and content type from that list, never from the browser's declared type, and the storage route sets the type from the extension with a sandboxing CSP (PDFs excepted) and sends anything else as an `application/octet-stream` attachment. Videos are accepted only by the video upload below: image uploads keep their own image-type list and Downloads refuse videos. Uploads not yet attached to a record (inline images, layer images, presigned URLs, videos) are rate-limited per user. `/storage/*` honours `Range: bytes=…` (206 with `Content-Range`, 416 when unsatisfiable, `Accept-Ranges: bytes` on every response) for both drivers, so videos can seek; with `S3_PUBLIC_URL` the bucket or CDN answers ranges itself.

### Large uploads on Vercel

Vercel functions reject request bodies over ~4.5 MB, so with `STORAGE_DRIVER=s3`:

- **Downloads (up to 20 MB)** are uploaded by the browser straight to the bucket with a presigned PUT URL. `POST /api/admin/uploads/direct` (`{ fileName, contentType, size }`) requires a signed-in user, checks the type (`file-types.ts` allowlist) and size (20 MB), and returns a server-generated `downloads/<random>.<ext>` key plus a 10-minute URL with the content type and length signed in. The key is recorded in `pending_uploads` as issued to that user; `downloads.create` receives `uploadedKey` instead of the file, claims it (only the issuing user, once, within an hour) and checks the stored size with `HeadObject`. A key never claimed only loses its `pending_uploads` row (dropped by the storage cleanup run); its object is deleted by that cleanup only when nothing references it and it is older than 24 hours. The admin form picks this path from a server flag (`directUploads`); `local` keeps the multipart path.
- **Videos (MP4 or WebM, up to 100 MB)** use two calls around the upload, the same on both drivers (`uploadVideo` in `src/components/admin/editor/upload.ts` does all three steps and reports progress). `POST /api/admin/uploads/video` (`{ fileName, contentType, size }`) checks the type and size, applies the per-user upload quota, and returns a server-generated `videos/<random>.<ext>` key recorded in `pending_uploads`, plus the URL to PUT the bytes to (here a 10-minute presigned bucket URL with the content type and length signed in). After the PUT, `POST /api/admin/uploads/video/complete` (`{ key }`) checks the key was issued to the caller, that the object exists and fits, claims the pending upload and returns the app URL `/storage/<key>` (also with `S3_PUBLIC_URL` set; the route redirects inline requests to the bucket base, and the bucket answers `Range` itself). Expiry of a never-completed key only drops its row, so a key already pasted into content keeps its file; any video that no content references is reclaimed by the storage cleanup after 24 hours.
- **Bucket CORS**: the browser PUTs cross-origin, so the bucket needs a rule like `[{"AllowedOrigins":["https://<site>"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]` (`aws s3api put-bucket-cors`, or the provider's CORS settings). Download uploads and video uploads both use it; without it video uploads fail in the browser at the PUT step.
- **Images** stay multipart: they are compressed to WebP in the browser first, and `LIMITS.image` is lowered to 4 MB on `s3`, so an oversized pass-through file (GIF, or a browser without WebP encoding) gets a clear validation message instead of a platform 413. The server converts every accepted image to WebP inside its size box (sharp, `src/lib/server/image-webp.ts`), keeping already-compressed WebP untouched.

### Self-hosting without S3

On your own server (Node adapter, `node dist/server/entry.mjs`) the `local` driver needs no S3: files are written to `UPLOAD_DIR` and served at `/storage/<key>`.

- Point `UPLOAD_DIR` at a persistent directory outside the deploy folder (e.g. `/var/lib/sic/uploads`) so files survive redeploys, and back it up with the database.
- Every upload except videos, including Downloads up to 20 MB, is a multipart request to an action. `security.actionBodySizeLimit` in `astro.config.mjs` is 24 MB (Astro's default is 1 MB); a reverse proxy in front needs at least the same, e.g. nginx `client_max_body_size 25m;`.
- Videos (up to 100 MB) are not actions: the browser PUTs the file to `PUT /api/admin/uploads/video` for a key issued by the `POST` of the same route, and the server streams the body to disk without holding it in memory, stopping and deleting the file as soon as it passes the announced size. The Node adapter's `bodySizeLimit` (`astro.config.mjs`) is 101 MB, just above the largest upload (it applies to every request body; Astro's default is 1 GB). A reverse proxy needs room for 100 MB there: `client_max_body_size 101m;` and `proxy_request_buffering off;` for `/api/admin/uploads/video`.
- Behind a proxy, set `ALLOWED_DOMAINS` at build time so per-IP rate limits see real clients, and make the proxy **overwrite** the client address instead of appending to what the client sent: nginx `proxy_set_header X-Forwarded-For $remote_addr;` (not `$proxy_add_x_forwarded_for`), plus `proxy_set_header X-Forwarded-Proto $scheme;` and `proxy_set_header X-Forwarded-Host $host;`. Otherwise a client can send its own `X-Forwarded-For` and sidestep the per-IP limits (sign-in, contact form). Sign-ins are additionally limited per email address (10 per 15 minutes) whatever the client address.
- `SITE_URL` with `https://` turns on `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`) on every response, also when TLS ends at the proxy. Only use it once every subdomain can be served over https.
- The Node server compresses text responses (HTML, XML, JSON, JS, CSS; brotli or gzip, bodies of 1 KB and up, never `/storage`), tags public pages with a weak `ETag` and answers `If-None-Match` with 304, and gives files from `public/` a one-day `Cache-Control` (`/_astro/*` stays immutable for a year). Do not enable a second compression layer for the same types in the proxy unless it is the only one. On Vercel the platform does this itself.
- `MAIL_MAILER=log` prints reset links and contact messages to the console and is refused when `NODE_ENV=production` (the first mail send fails with an error naming the setting). Set `MAIL_MAILER=smtp` with the `MAIL_*` variables.
- Clean up unused files with a system cron. `vp run storage:cleanup` deletes stored files that no database row references (any text column, including post content and carousel layers) and that are older than 24 hours, and drops expired `pending_uploads` rows (their files are only ever deleted by this same unreferenced-and-old rule); `vp run storage:cleanup -- --dry-run` only lists them. Example crontab (daily at 03:17, from the app directory, with `DATABASE_URL`/`UPLOAD_DIR` in `.env`):

    ```cron
    17 3 * * * cd /srv/sic && devenv shell -- vp run storage:cleanup >> /var/log/sic-storage-cleanup.log 2>&1
    ```

## Deploying to Vercel

Vercel runs the app with the Vercel adapter (selected when `VERCEL` is set during `vercel build`, or with `ASTRO_ADAPTER=vercel`; `vercel.json` sets the build command `node scripts/prisma-schema.mjs && prisma generate && astro build`). The server keeps no state on disk: toasts use a short-lived httpOnly cookie (`sic_flash`), auth rate limits live in the `auth_rate_limits` table, uploads go to S3.

1. **Database (Neon)**: add the Neon integration to the Vercel project. Runtime `DATABASE_URL` is the **pooled** connection string (`postgresql://…-pooler…`). Migrations are not run by Vercel; CI runs `prisma migrate deploy` with the **direct** (non-pooled) URL before deploying, and `vercel.json` disables Vercel's Git deployments (`git.deploymentEnabled: false`) so nothing ships ahead of migrations.
2. **S3 bucket**: create a bucket (AWS S3 or an S3-compatible service such as Cloudflare R2) and an access key limited to it (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`, and `s3:ListBucket` on `arn:aws:s3:::<bucket>` for the storage cleanup). Add the CORS rule above for the production origin. Optionally make it public-read behind a CDN and set `S3_PUBLIC_URL`; otherwise files stream through `/storage/*`.
3. **Environment variables** (Production): `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ random chars), `BETTER_AUTH_URL` and `SITE_URL` (the public origin), `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT` (non-AWS), `S3_FORCE_PATH_STYLE`, `S3_PREFIX`, `S3_PUBLIC_URL`, and `MAIL_MAILER=smtp` with `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `CONTACT_TO_ADDRESS`, and `CRON_SECRET` (16+ random characters).
4. **Storage cleanup**: `vercel.json` schedules a daily Vercel Cron call to `GET /api/cron/storage-cleanup`. Vercel sends `Authorization: Bearer $CRON_SECRET` itself; the route answers 401 for any other caller and 503 while `CRON_SECRET` is unset. Each run deletes at most 1000 unreferenced files older than 24 hours and stops after about 40 seconds; the next run continues (on plans with a shorter function limit it simply takes more runs).
5. **First admin**: nothing is seeded in production. Run once from a machine with the direct database URL:

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
3. `vp test` runs tests that import modules without `astro:*` imports (authz, request errors, password login, storage, password, markdown, slug).
4. Code under test stays free of `astro:*` imports; `astro:actions` usage is isolated in `src/lib/server/action-guard.ts` and `src/actions/*`.
5. NixOS: Prisma has no prebuilt engines for NixOS; `devenv.nix` points `PRISMA_SCHEMA_ENGINE_BINARY` at `pkgs.prisma-engines_7` (keep its version equal to the `prisma` devDependency). Playwright browsers come from `pkgs.playwright-driver` (keep `@playwright/test` pinned to the same version).
