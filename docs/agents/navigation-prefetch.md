# Navigation, prefetch and the staff hint

## Admin and settings navigation

- Client-side: `<ClientRouter />` in `AppLayout`, with intent prefetch and a progress bar in `src/scripts/admin-navigation.ts`. Prefetched HTML is used only for plain link clicks within 15 s; forms and programmatic navigations fetch fresh.
- In admin islands, navigate with `navigate()` from `astro:transitions/client` and refresh with `reloadView()` from `@/lib/navigation`, so the prefetch cache is invalidated. `window.location` is for auth changes only (logout, account deletion).
- What counts as a plain link (same origin, no foreign `target`/`download`, another document) is `plainLinkUrl` in `src/lib/link-intent.ts`, shared by both prefetch scripts and the unsaved-changes guard (`auth-admin.md`).

## Public prefetch

- `src/scripts/public-prefetch.ts` (loaded by `PublicLayout` for anonymous visitors only) calls Astro's `prefetch` on hover (65 ms), touch (same delay, cancelled when the finger moves) or focus, for links that `isPublicPage` (`request-policy.ts`) accepts. The click then reuses the `PUBLIC_CACHE_CONTROL` response.
- It never targets private routes, `/storage`, feeds or signed-in pages (`no-store`, not reusable). `prefetch.prefetchAll` stays off.

## Staff hint

- `sic_staff` (`src/lib/staff-hint.ts`) is a value-free, non-httpOnly cookie, because the session cookie is httpOnly and scripts cannot see it. `public-prefetch.ts` stays off while it is present, so a signed-in person served cached anonymous HTML triggers no prefetch.
- The middleware sets or clears it after `next()`, from the final response: `staffHintAction({ signedIn, hinted, cacheControl })` returns `'set'`, `'delete'` or `null`, and acts only on `no-store` responses, so a shared cache never stores a `Set-Cookie`.
- `cookieValue` (`src/lib/cookie-header.ts`, free of `astro:*`, URI-decoded) reads cookies on the server and in the browser scripts; `hasStaffHint` uses it.
