# San Isidro College — website (Astro)

Full-stack Astro port of the Laravel/Inertia site. Server-rendered for SEO, Svelte islands only where interaction is needed.

Stack: Astro 7 (`output: 'server'`, Node standalone) · Svelte 5 islands · Tailwind v4 · Prisma 7 (SQLite in dev; MySQL/MariaDB or PostgreSQL by URL) · Better Auth · Astro Actions · local-disk uploads · Vite+ (`vp`) for lint/format/test/tasks · devenv for the toolchain.

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
| Prisma Studio                                           | `vp run db:studio`                                        |

`vp` is the project-local Vite+ CLI (`pnpm exec vp` outside devenv). Astro owns dev/build, so they run as tasks (`vp run dev`), never `vp dev`.

## Database

- Edit `prisma/schema.base.prisma` only. `scripts/prisma-schema.mjs` renders the gitignored `prisma/schema.prisma` with the provider taken from `DATABASE_URL` (`file:` → sqlite, `mysql://`/`mariadb://` → mysql, `postgres(ql)://` → postgresql) and runs on install and every `db:*` task.
- Runtime picks the matching driver adapter (`src/lib/server/db.ts`): better-sqlite3, mariadb or pg.
- Migrations are provider-specific: `prisma/migrations/<provider>/`. Switching provider = set `DATABASE_URL`, then `vp run db:migrate` to create that provider's baseline.
- Table and column names match the Laravel schema; Better Auth uses its own `auth_sessions`, `auth_accounts`, `auth_verifications` tables.

## Uploads

`STORAGE_DRIVER` selects the backend (see `.env.example`); code only talks to `src/lib/server/storage` (`put`, `remove`, `read`, `publicUrl`, `downloadUrl`), and the database stores bare keys (`posts/abc.jpg`).

| `STORAGE_DRIVER`  | Where files live                                                                                                                             | URLs                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `local` (default) | `UPLOAD_DIR` on the server disk (default `storage/uploads`)                                                                                  | `/storage/<key>`, streamed by `src/pages/storage/[...path].ts`                                                                                 |
| `s3`              | `S3_BUCKET` on AWS S3 or any S3-compatible service (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true` for self-hosted ones such as Garage/SeaweedFS) | `/storage/<key>` streamed from the bucket; with `S3_PUBLIC_URL` set, `<S3_PUBLIC_URL>/<key>` directly and `/storage/<key>` 301-redirects there |

Legacy Laravel `/storage/...` links keep working with both drivers. `?download=<name>` always streams through the app so the attachment name applies. Switching drivers does not move existing files: copy `UPLOAD_DIR` into the bucket under `S3_PREFIX` with the same keys (e.g. `aws s3 sync storage/uploads s3://<bucket>/<prefix>`).

## SEO

Per-page title/description/canonical/Open Graph/Twitter via `BaseLayout` props (`src/components/seo/Seo.astro`), JSON-LD (`CollegeOrUniversity`, `WebSite`, `BreadcrumbList`, `NewsArticle`, `Event`), dynamic `/sitemap.xml`, `/robots.txt`, `/rss.xml`, `noindex` + `no-store` on private routes, public `Cache-Control` on public pages.

## Toolchain spike results (plan Phase 1)

1. `vp --version`: Vite 8.3.3, Vitest 5.0.3, Oxfmt 0.72; `vp run build` produces `dist/server/entry.mjs`.
2. `vp check` runs Oxfmt + Oxlint (type-aware) on `.ts`/`.svelte`; `.astro` is formatted by Prettier (`vp run fmt:astro`).
3. `vp test` runs tests that import modules without `astro:*` imports (authz, storage, password, markdown, slug).
4. Code under test stays free of `astro:*` imports; `astro:actions` usage is isolated in `src/lib/server/action-guard.ts` and `src/actions/*`.
5. NixOS: Prisma has no prebuilt engines for NixOS; `devenv.nix` points `PRISMA_SCHEMA_ENGINE_BINARY` at `pkgs.prisma-engines_7` (keep its version equal to the `prisma` devDependency). Playwright browsers come from `pkgs.playwright-driver` (keep `@playwright/test` pinned to the same version).
