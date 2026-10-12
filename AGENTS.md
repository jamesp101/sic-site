# AGENTS.md

San Isidro College website. Astro 7 SSR + Svelte 5 islands + Tailwind v4 + Prisma 7 + Better Auth. See `README.md` for commands and `astro-migration-plan.md` for the design rules (§3) and the revision notes at its top.

## Environment

- Run everything inside `devenv shell` (NixOS: Prisma engines and Playwright browsers come from nixpkgs). `devenv up` = dev stack, `devenv test` = full CI.
- Use `vp` (Vite+) for check/test/tasks; Astro owns dev/build (`vp run dev`, `vp run build`). Never call `vp dev`/`vp build`.
- Installed agent skills: `.claude/skills/{astro,prisma-cli,prisma-client-api,prisma-orm-setup,prisma-driver-adapter-implementation}`.

## Rules

- Schema: edit `prisma/schema.base.prisma` only; keep Laravel table/column names (`@@map`/`@map`). Use `{{longtext}}` for long text columns. Then `vp run db:migrate`.
- DB access: `import { db } from '@/lib/server/db'`. Public view models are defined in `src/lib/content-types.ts` and produced by `src/lib/server/queries.ts`.
- Authorization: every action and admin page calls `src/lib/server/authz.ts` first (`requireUser`, `requireSuperAdmin`, `scopeDepartment`, `departmentForWrite`, `departmentFilter`). Actions wrap bodies in `guarded()` from `src/lib/server/action-guard.ts`.
- Files: `src/lib/server/storage` only (`put`, `remove`, `read`, `publicUrl`, `downloadUrl`); backend chosen by `STORAGE_DRIVER` (`local` | `s3`). Store bare keys; never hard-code `/storage/` URLs.
- Admin/settings navigation is client-side (`<ClientRouter />` in `AppLayout`), with intent prefetch + progress bar in `src/scripts/admin-navigation.ts` (prefetched HTML is used only for plain link clicks within 15 s; forms and programmatic navigations fetch fresh). In admin islands, navigate with `navigate()` from `astro:transitions/client` and refresh with `reloadView()` from `@/lib/navigation` so the prefetch cache is invalidated; reserve `window.location` for auth changes (logout, account deletion).
- JS-handled forms declare `method="post"` (never a default GET) so an island that fails to hydrate cannot put field values, especially passwords, in the URL. `/login` also handles that POST server-side.
- Testable server code stays free of `astro:*` imports. Tests: `src/**/*.test.ts`, import from `vite-plus/test`. E2E in `e2e/` runs against a fresh `storage/e2e.db` + `storage/e2e-uploads` (see `playwright.config.ts`), never the dev database.
- Design: colours only through tokens (`src/styles/tokens.css`, Tailwind names like `bg-brand-800`, `text-primary`, `text-muted-foreground`); no hex in components. Serif (Playfair Display) for h1/h2 only; min text size 12 px; one h1 per page; skip link + landmarks; visible focus ring.
- SEO: every public page passes `title`, `description`, canonical-safe URL, and JSON-LD where meaningful via layout props; private routes are `noindex` (middleware). Keep public pages free of admin bundles; hydrate islands only where needed.
- No cloud hosting assumptions; S3 is an optional storage backend only. No placeholder content or images; missing imagery renders a token-coloured fallback.
