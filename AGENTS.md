# AGENTS.md

San Isidro College website. Astro 7 SSR + Svelte 5 islands + Tailwind v4 + Prisma 7 + Better Auth. See `README.md` for commands and `astro-migration-plan.md` for the design rules (§3) and the revision notes at its top.

## Environment

- Run everything inside `devenv shell` (NixOS: Prisma engines and Playwright browsers come from nixpkgs). `devenv up` = dev stack, `devenv test` = full CI.
- Use `vp` (Vite+) for check/test/tasks; Astro owns dev/build (`vp run dev`, `vp run build`). Never call `vp dev`/`vp build`.
- Installed agent skills: `.claude/skills/{astro,prisma-cli,prisma-client-api,prisma-orm-setup,prisma-driver-adapter-implementation}`.

## Rules

- Schema: edit `prisma/schema.base.prisma` only; keep Laravel table/column names (`@@map`/`@map`). Use `{{longtext}}` for long text columns. Then `vp run db:migrate`.
- DB access: `import { db } from '@/lib/server/db'`. Public view models are defined in `src/lib/content-types.ts` and produced by `src/lib/server/queries.ts`.
- Rich content (posts, hero sections, `welcome_hero_content`) is a JSON block document (`{"type":"sic-blocks","version":1,…}`, `src/lib/blocks/`) or legacy Markdown. Render only via `renderContent` (`@/lib/blocks/content`), excerpt via `toPlainText`, validate on save via `contentField()` (`@/lib/server/content-field`). New block types need schema + renderer + plain-text + editor inspector + tests. Department `hero_content` is still Markdown.
- Carousel slides may carry `carousel_items.overlay` (JSON `{v:1, layers:[…]}`, positions in % of the 16:9 slide, token colours/sizes; `src/lib/carousel-overlay*.ts`). Null = legacy title/subtitle/link rendering. Validate with the overlay schema; layer images live under `carousels/` and are cleaned up on update/delete.
- Org chart: `/admin/departments/<id>/members` is a visual editor (`components/admin/members/OrgChartEditor.svelte`, public look from `components/site/OrgChart.astro`). All tree logic (ordering, moves, cycle checks, reparent-on-delete) lives in `src/lib/org-tree.ts` and is shared with `actions/members.ts` (`reorder` takes `[{id, parentId, order}]` for one department in a transaction; `delete` moves direct reports up to the manager). Chart changes are drag/keyboard driven and saved optimistically with rollback.
- Authorization: every action and admin page calls `src/lib/server/authz.ts` first (`requireUser`, `requireSuperAdmin`, `scopeDepartment`, `departmentForWrite`, `departmentFilter`). Actions wrap bodies in `guarded()` from `src/lib/server/action-guard.ts`.
- Files: `src/lib/server/storage` only (`put`, `remove`, `read`, `publicUrl`, `downloadUrl`); backend chosen by `STORAGE_DRIVER` (`local` | `s3`). Store bare keys; never hard-code `/storage/` URLs.
- Admin/settings navigation is client-side (`<ClientRouter />` in `AppLayout`), with intent prefetch + progress bar in `src/scripts/admin-navigation.ts` (prefetched HTML is used only for plain link clicks within 15 s; forms and programmatic navigations fetch fresh). In admin islands, navigate with `navigate()` from `astro:transitions/client` and refresh with `reloadView()` from `@/lib/navigation` so the prefetch cache is invalidated; reserve `window.location` for auth changes (logout, account deletion).
- JS-handled forms declare `method="post"` (never a default GET) so an island that fails to hydrate cannot put field values, especially passwords, in the URL. `/login` also handles that POST server-side.
- Testable server code stays free of `astro:*` imports. Tests: `src/**/*.test.ts`, import from `vite-plus/test`. E2E in `e2e/` runs against a fresh `storage/e2e-<E2E_PORT>.db` + uploads dir (see `playwright.config.ts`), never the dev database; specs take storage states from `e2e/auth-state.ts`. Parallel runs: set distinct `E2E_PORT` and `E2E_DIST` (build with `astro build --outDir <dist>`).
- Design: colours only through tokens (`src/styles/tokens.css`, Tailwind names like `bg-brand-800`, `text-primary`, `text-muted-foreground`); no hex in components. Serif (Playfair Display) for h1/h2 only; min text size 12 px; one h1 per page; skip link + landmarks; visible focus ring.
- SEO: every public page passes `title`, `description`, canonical-safe URL, and JSON-LD where meaningful via layout props; private routes are `noindex` (middleware). Keep public pages free of admin bundles; hydrate islands only where needed.
- No cloud hosting assumptions; S3 is an optional storage backend only. No placeholder content or images; missing imagery renders a token-coloured fallback.
