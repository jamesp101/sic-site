# Authorization, Users, admin pages and forms

## Authorization

- Every action, API route and admin page calls `src/lib/server/authz.ts` first: `requireUser`, `requireSuperAdmin`, `scopeDepartment`, `scopeOwnDepartment`.
- Rows load through `loadScoped(actor, model, id)` (one row), `loadScopedMany(actor, model, ids)` (a batch: NOT_FOUND if any is missing, FORBIDDEN if any is another department's), `loadMember(actor, departmentId, id)` and `loadOwnDepartment`.
- The department to store comes from `resolveWriteDepartment` (`src/lib/server/department-access.ts`: existence check, NOT_FOUND/FORBIDDEN). Department inputs use the shared `departmentIdField` zod schema; department `<select>` options come from `departmentOptions(actor)` (same module). Use these everywhere instead of per-action copies.
- Rejected requests are one type, `RequestError` (`request-error.ts`, free of `astro:*`; codes BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, UNPROCESSABLE_CONTENT, TOO_MANY_REQUESTS). `authz` and every domain module throw only it, never `ActionError` or a hand-built `json({ message }, 4xx)`.
- One adapter per entry point:
    - actions wrap the handler in `guarded()` (`action-guard.ts`), which maps `RequestError` to `ActionError`;
    - `/api/admin/**` routes use `adminRoute()` (`api-route.ts`);
    - admin, settings and dashboard pages call `adminPage(Astro.locals.user, { superAdmin?, load? })` (`admin-page.ts`, with `parseId`), which returns `{ actor, row }` or the error Response to `return`. Pages carry no try/catch of their own.
- Toasts go through `flash()` (`action-guard.ts`): a short-lived httpOnly `sic_flash` cookie read by `takeFlash` in `AppLayout`.
- Never enable Better Auth `cookieCache`: password changes and account deletion must end sessions at once.

## Request context and Admin scope

- `src/middleware.ts` only assigns `resolveRequestContext` to `Astro.locals` and applies the request policy (`http-security.md`). `resolveRequestContext` (`src/lib/server/request-context.ts`, free of `astro:*`) turns request headers/cookies into `{ user, session, adminScope, adminDepartments }`: the session → User mapping and the Admin scope lookup. It reads cookies with `cookieValue` (`src/lib/cookie-header.ts`).
- The sidebar switcher (`components/admin/ScopeSwitcher.svelte`) stores `admin_scope` (`all` | `main` | `<department id>`) in a cookie and calls `reloadView()`. On every `/admin`, `/dashboard` and `/settings` request the scope is resolved through `src/lib/server/admin-scope.ts` into `Astro.locals.adminScope` (unknown ids → `all`; department users are pinned to their department). Main scope = rows with `departmentId = null`.
- Create forms preselect `scopeDefaultDepartment(scope)`.

## Admin lists

- Paginated admin lists (posts, hero sections, departments, downloads, users) run through `runList` (`src/lib/server/admin-list.ts`). The page declares its sortable fields (`sortBy`, default direction per field), search fields and filters, and gets back the rows, totals and the `sortHref`/`ariaSort`/`pageHref` links. Pages build no `orderBy`, sort link or page clamp. A filter is declared once, in `filters` keyed by its query parameter: `listFilter(parse, where)` (`parse` returns `null` for an absent or invalid value, which is ignored; `where` narrows the Prisma `where` for a parsed value; `parseYesNo` for yes/no selects). `runList` derives the combined `where`, `filtered` (search or a filter is set; sort/dir/page do not count) and `resetHref` (list path without `q`, the declared filter parameters and `page`, keeping sort/dir) from them, and returns the parsed values as `list.values` for the page's controls, so a page never parses a filter twice. There is no `filterParams`. Use `filtered`/`resetHref` for the empty row and Reset link (and pass `filtered` to `DownloadsManager`), never a hand-built flag or hard-coded path.
- The search form is `ListFilterBar.astro` (`list`, `placeholder`, `label`, optional `submitLabel`); a page puts its own filter controls in the default slot.
- Rendering: `SortableTh`, `EmptyRow`, `ListPagination` in `components/admin/shared/` (the "Pages" nav and "Showing x–y of N" come from `ListPagination`); page widths from `widePageClass`/`formPageClass` in `admin/ui.ts`.
- Other list queries filter with `departmentWhere(actor, scope)` / `listWhere(actor, scope, [search, type, …])` only. The actor's restriction always wins: `runList` applies it through `listWhere`, which ANDs extra filters so a search `OR` cannot overwrite it. Spreading a filter next to `departmentWhere` loses that guarantee. `{ includeGeneral: true }` adds department-less rows (e.g. download directories). No per-page department filters.

## Users and Password login

- A User's Password login (the `credential` Account row plus the hash mirrored into `users.password`) is created, replaced and read only through `src/lib/server/password-login.ts` (free of `astro:*`): `setPasswordLogin(client, userId, hash, { endSessions })`, `endSessions(client, userId, except)` ("end the other sessions, keep mine"), `currentPasswordHash`, `assertPassword`. User create/update, account, `create-admin` and the seed use it; nothing else touches `db.account` or `db.session` (Better Auth aside).
- Current-password checks go through `assertPassword`; changing the email requires it.
- Password minimums live only in `src/lib/password-policy.ts` (client-safe): `MIN_PASSWORD_LENGTH` (Users, 8), `MIN_ADMIN_PASSWORD_LENGTH` (`create-admin`, 12), error/hint wording. Actions, the Better Auth config and the forms import it.
- "Keep at least one Superadmin" lives in `user-rules.ts`: the check and the write run in one Serializable `superadminTransaction` (a conflict is a 409 "try again"). `users.update` demotion uses `assertUserDemotable` inside it; `users.delete` and `account.deleteAccount` call `deleteUserWithFiles` (owned files removed after the commit).
- Sign-in (`login.astro`'s no-JS POST), sign-out and the current session id go through `src/lib/server/auth-session.ts` (`getSession`, `signIn`, `signInFailure`, `signOut`, `currentSessionId`). `auth.api` is called only there, besides the `pages/api/auth/[...all].ts` handler mount. Account changes go through `actions/account.ts` only.
- Mail texts (reset, verify, email-changed, contact) are composed in `src/lib/server/mail-messages.ts`; callers pass data to `sendMail`.
- Production admin bootstrap: `prisma/create-admin.ts` (`ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` or TTY prompt).

## Rate limits

Counters live in `auth_rate_limits`, shared by every serverless instance.

- Better Auth's own limits use `storage: 'database'`.
- App limits use `consumeRateLimit` under `app:` keys (`RATE_LIMITS` in `src/lib/server/rate-limit.ts`): password checks, contact form, and uploads (`assertUploadQuota`: endpoints that store files not yet attached to a record, per user).
- Sign-in: the `auth.ts` before hook claims a slot before the password is checked (`claimSignInAttempt`, atomic, so parallel guesses cannot exceed the limit); the after hook gives it back on success (`refundSignInAttempt`), so only failures stay counted. Limits: 10 per email + client IP and 100 per email, each per 15 minutes. It runs for the `/login` POST and `/api/auth/sign-in/email` alike.
- The daily storage cleanup deletes expired `app:` rows (`sweepExpiredRateLimits`).

## Forms

- JS-handled forms declare `method="post"` (never a default GET), so an island that fails to hydrate cannot put field values, especially passwords, in the URL. `/login` also handles that POST server-side.
- Submit state (processing, field errors, message, success callback) comes from `actionForm()` (`components/admin/shared/action-form.svelte.ts`; pure core in `action-form-core.ts`), in admin, settings and auth forms alike. `fieldByCode` maps an action error code to its field (`{ CONFLICT: 'email' }`). After a failed submit the first `[aria-invalid="true"]` control is focused, else the `[data-form-message]` alert (`FormActions`, `Notice`).
- Controls get `id`, `aria-describedby` and `aria-invalid` from the `Field` snippet props (`admin/shared/Field.svelte`, `auth/Field.svelte`).

## Unsaved changes

Forms and the slide designer with changes worth keeping use `UnsavedChangesGuard` (`components/admin/shared`, core in `unsaved-guard.ts`, free of `astro:*` and Svelte), driven by a dirty flag. Forms use the `unsavedChanges()` snapshot tracker: call `markSaved()` before navigating; mark the page's own form `data-unsaved-own`. No other `beforeunload`/click listeners.

- Plain link clicks and form submits are held earlier, by capture-phase listeners. Link detection is `plainLinkUrl` (`navigation-prefetch.md`).
- A programmatic `navigate()` and back/forward go to the browser through `astro:before-preparation`'s `preventDefault`: the router does a full navigation and `beforeunload` asks. The browser prompt stays on history traversal.
- Back/forward restores the history position: after "Keep editing" the guard steps the history back (`history.go(1)` after Back, `go(-1)` after Forward) once the router has handed over (a timer, so the `beforeunload` question is answered first), and swallows the popstate of that step.
- A held form submit is re-submitted with `requestSubmit`; the flag resets after that submit settles (`astro:after-swap`), or at once if the browser refuses the invalid form.

## Dialogs

- `components/ui/dialog`: `Dialog` generates an id (`$props.id()`); `DialogTitle` takes the id for `aria-labelledby`, and `DialogDescription` for `aria-describedby`, which is set only while a description is mounted.
- `Sheet` (`components/ui/sheet`) is named by its `label` prop (`aria-label`).
