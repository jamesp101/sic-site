# Public site: queries, SEO, navigation, Downloads, print

Public view models are defined in `src/lib/content-types.ts` and produced by `src/lib/server/queries.ts` (DB access: `import { db } from '@/lib/server/db'`).

## Queries

- The pool size is explicit (`src/lib/server/db.ts`): `DATABASE_POOL_SIZE`, or `?connectionLimit=` in `DATABASE_URL` for MariaDB; default 5 for MariaDB, 3 for PostgreSQL.
- `PublicLayout` takes one input, `layout` (`LayoutQueries`: `navLinks` and `departments` promises), and starts them itself when omitted (404 page).
- Every public page query (`getHomeData`, `getPostsPage`, `getPostPage`, `getDepartmentPage`, `getDownloadsPage`) returns `layout` from `startLayoutQueries()` (`queries.ts`), called before its own queries so they run side by side; by-slug queries call it right after the row lookup, so an unknown slug costs one query. The promises are marked handled, so an early return (404) cannot leave an unhandled rejection. Pages pass `layout` through; a page that needs Departments itself (filter bar, home cards) awaits `layout.departments`, the same query. Contact has no page query and calls `startLayoutQueries()` itself.
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

Page frame (`src/styles/app.css`): `page-frame` is the full page width (header, breadcrumbs, banners, sections, footer), `reading-frame` the Post body column; both share the gutter, so every edge lines up. `--measure` (70ch) caps text in Block documents (`[data-sic-blocks]`) and Legacy Markdown (`[data-sic-markdown]`, with its `<Center>` column `[data-sic-center]`; both emitted by the renderer, so any page that outputs the HTML gets the measure) per paragraph, list and quote, never on the whole content, so grids, cards and accordions keep the full width. The Block editor canvas (`buildSrcdoc`, `frame: 'reading' | 'page'`) uses the same classes; `e2e/editor.spec.ts` checks the preview matches the public Post body and section, and `e2e/public.spec.ts` checks sections line up with the header. Centred compositions (`BrandHero`, `ErrorPanel`) keep their own narrower width and take the gutter from `--frame-gutter` (`px-(--frame-gutter)`).
