# Testing

## Unit tests

- Tests are `src/**/*.test.ts` and import from `vite-plus/test`. Run them with `vp test`.
- Testable server code stays free of `astro:*` imports.
- DB-backed unit tests use `src/lib/server/test-db.ts`: a temporary SQLite database with the migrations applied, seeded with Prisma, through its own client in `src/generated/prisma-sqlite` (so they pass whatever provider dev uses), with `vi.mock('./db')`. See `department-access.test.ts`. Use it for DB-backed server code instead of mocked Maps.

## E2E

- Specs in `e2e/` run against a fresh database of the dev provider (`storage/e2e-<E2E_PORT>.db`, or `<db>_e2e_<E2E_PORT>` on MariaDB) plus an uploads dir (`storage/e2e-uploads-<E2E_PORT>`), never the dev database. Setup: `e2e/env.ts`, `e2e/reset-db.ts`.
- Specs take storage states (`ADMIN`, `CIT`) from `e2e/auth-state.ts`; `e2e/auth.setup.ts` creates them. Shared helpers: `e2e/support.ts` (`RUN`, `visitorPage`, `islandHydrated`, `clickUntilVisible`).
- Parallel runs: set distinct `E2E_PORT` and `E2E_DIST` (build with `astro build --outDir <dist>`).

## Action driver

`postAction(page, 'posts.create', { json } | { multipart })` in `e2e/actions.ts` posts a named Astro action with `page`'s session (the page must have loaded a URL of the site, whose origin becomes the Origin header Astro checks). It returns `{ ok, status, data, text }`: `data` is the decoded devalue result, or the error body `{ type, code, message }`. Multipart input takes strings, numbers, booleans and `FilePart`s. `e2e/action-authz.spec.ts` uses it for authorization checks.

## Demo data

`prisma/demo-data.ts` is shared by `prisma/seed.ts` and the e2e specs: the Users, Departments, Posts, Hero sections and Members that specs look up by name. Rows refer to each other by key (`department: 'cit'`, `author: 'cit'`, `parent: <member name>`); the seed resolves keys to ids. Seeding writes demo Users with known passwords, so only a local database is accepted unless `SEED_ALLOW_REMOTE=1` (`assertLocalDatabase`); `seedPassword` reads `SEED_SUPERADMIN_PASSWORD` / `SEED_DEPARTMENT_PASSWORD`, else `password`.
