# Public site: queries, SEO, navigation, Downloads, print

Public view models are defined in `src/lib/content-types.ts` and produced by `src/lib/server/queries.ts` (DB access: `import { db } from '@/lib/server/db'`).

## Queries

- The pool size is explicit (`src/lib/server/db.ts`): `DATABASE_POOL_SIZE`, or `?connectionLimit=` in `DATABASE_URL` for MariaDB; default 5 for MariaDB, 3 for PostgreSQL.
- `PublicLayout` takes `navLinks` and `departments` as values or promises, and loads them itself when omitted.
- Post and Department pages get them from `getPostPage` / `getDepartmentPage`, which return `navLinks`/`departments` promises: the queries start right after the row lookup, so an unknown slug costs one query and a found page runs them beside its own remaining queries. Pass them through to `PublicLayout`.
- Other public pages start `getNavLinks()` / `getDepartments()` at the top of their frontmatter with `startQuery` (`queries.ts`; it marks the promise handled, so an early return cannot leave an unhandled rejection) and pass the promises, or what they already loaded.
- Post cards and lists never parse `content` (`content-blocks.md`).

## SEO

- Every public page passes `title`, `description`, a canonical-safe URL and, where meaningful, JSON-LD through layout props. Private routes are `noindex`.
- Page queries (`getPostPage`, `getDepartmentPage`, `getPostsPage` in `queries.ts`; `getDownloadsPage` in `downloads.ts`) return a `PageSeo` built by `src/lib/seo.ts` (`siteUrl`, `canonicalHref`, the single description clamp `metaDescription`). Pages pass it through instead of assembling SEO props.
- List filters for `/posts` and `/downloads` (parse, `postsHref`/`downloadsHref`) come from `src/lib/post-filters.ts`.

## Site navigation

Header, footer and the default menu come from `src/lib/site-nav.ts`: `headerItems`, `footerItems`, `DEFAULT_NAV_LINKS`, `DEPARTMENTS_MENU_URL`, `departmentHref`, `postHref` (Post URLs), `SITEMAP_PAGES`/`STATIC_PATHS`. Other files write no `/departments/<slug>` href, `#departments` literal or fallback menu.

## Downloads page

`getDownloadsPage` (`src/lib/server/downloads.ts`) is the one Downloads module:

- Tag encode/decode (`encodeTags`/`parseTags`);
- `DEFAULT_DIRECTORY` = General for a Download without a Directory;
- the admin file view `toAdminDownload` and the folder map `getAdminFolders`;
- the Directory counts, folder links and the `noindex` of filtered pages.

Actions and pages call these, never copies. `DownloadBrowser` only renders the result. The page is not paginated: it groups by Directory with a count per group.

## Print and page weight

- Printed Posts: the `@media print` block in `src/styles/app.css` (article only, black on white, external link addresses spelled out). `src/scripts/print-details.ts`, loaded by `PublicLayout`, opens closed accordions on `beforeprint` and closes them on `afterprint`; the CSS covers browsers that support `::details-content`.
- Public pages carry no admin bundles; hydrate islands only where needed.
- No placeholder content or images: missing imagery renders a token-coloured fallback.

## Design

Colours only through tokens (`src/styles/tokens.css`; Tailwind names like `bg-brand-800`, `text-primary`, `text-muted-foreground`), no hex in components. Form control borders use `border-input-border` (≥3:1, WCAG 1.4.11), not `border-border-strong`. Serif (Playfair Display) for h1/h2 only; minimum text size 12 px; one h1 per page; skip link + landmarks; visible focus ring.
