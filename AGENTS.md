# AGENTS.md

San Isidro College website. Astro 7 SSR + Svelte 5 islands + Tailwind v4 + Prisma 7 + Better Auth. See `README.md` for commands, `GLOSSARY.md` for domain terms (Slide, Layer, Highlight image, Department, …) and `astro-migration-plan.md` for the design rules (§3).

## Environment

- Run everything inside `devenv shell` (NixOS: Prisma engines, Playwright browsers and MariaDB come from nixpkgs). `devenv up` = dev stack (MariaDB + astro dev); `devenv test` = full CI on a throwaway SQLite file.
- Use `vp` (Vite+) for check/test/tasks; Astro owns dev/build (`vp run dev`, `vp run build`). Never call `vp dev`/`vp build`.
- Installed agent skills: `.claude/skills/{astro,prisma-cli,prisma-client-api,prisma-orm-setup,prisma-driver-adapter-implementation}`.

## Always apply

- Schema: edit `prisma/schema.base.prisma` only, keep Laravel table/column names (`@@map`/`@map`); `{{longtext}}` for long text, `{{text}}` for strings that can exceed 255 characters (MySQL String is VARCHAR(255)).
- Migrations: `vp run db:migrate`, then add the same migration to every `prisma/migrations/<provider>/` folder (sqlite, mysql, postgresql), named to sort after existing ones.
- Design: colours only through tokens (`src/styles/tokens.css`), no hex in components.
- Authorization: every action, API route and admin page calls `src/lib/server/authz.ts` first, through its adapter (`guarded()`, `adminRoute()`, `adminPage()`).
- Rich content: render, parse, excerpt and validate only through `@/lib/blocks/content`; writers set `searchText: searchTextOf(content)`.
- Files: only through `src/lib/server/storage`; rows that own files write and remove them through `commitWithFiles` / `deleteWithFiles` (`stored-files.ts`); store bare keys.
- No server filesystem or in-process state (serverless on Vercel): no `Astro.session`, no on-disk caches outside the `local` driver; shared counters and flash live in the database and cookies.
- Tests: `src/**/*.test.ts` beside the code, importing from `vite-plus/test`; testable server code stays free of `astro:*`; e2e in `e2e/`.

## Area docs

Read the doc before editing in its area.

- Editing posts, hero sections, the Welcome hero or `src/lib/blocks`, or the block editor → `docs/agents/content-blocks.md`
- Editing carousel slides, overlays, `carousel-layout` or `CarouselDesigner` → `docs/agents/carousel-designer.md`
- Editing `NavLinksEditor`, the Org chart or `tree-edit-session` → `docs/agents/tree-editors.md`
- Adding an action, API route, admin page or list; changing Users, passwords, sign-in, rate limits, forms, the unsaved guard or dialogs → `docs/agents/auth-admin.md`
- Editing `src/lib/server/storage`, uploads, image variants or storage cleanup → `docs/agents/storage-images.md`
- Editing admin navigation, public prefetch or the `sic_staff` hint → `docs/agents/navigation-prefetch.md`
- Editing the middleware, request policy, CSP, compression, caching or the adapter → `docs/agents/http-security.md`
- Editing public pages, page queries, SEO, `site-nav`, the Downloads page or print styles → `docs/agents/public-site.md`
- Writing unit or e2e tests, the action driver or demo data → `docs/agents/testing.md`
