/**
 * Empties the e2e database before the Playwright web server migrates and seeds it (see e2e/env.ts):
 * deletes the SQLite file, or drops and recreates the `<dev db>_e2e_<port>` MariaDB/MySQL database.
 * A database given through E2E_DATABASE_URL is never dropped: it must already be empty (CI services).
 * Other providers (PostgreSQL) need E2E_DATABASE_URL pointing at an empty database.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { providerFromUrl } from '../prisma/provider.mjs';
import { DATABASE_URL, E2E_DB_SUFFIX } from './env';

const provider = providerFromUrl(DATABASE_URL);
if (provider === 'sqlite') {
    rmSync(DATABASE_URL.slice('file:'.length), { force: true });
} else if (provider === 'mysql' && !process.env.E2E_DATABASE_URL) {
    const url = new URL(DATABASE_URL);
    const name = url.pathname.slice(1);
    // Only the database e2e/env.ts derived for this run (`<dev db>_e2e_<port>`), never a dev or production one.
    if (!name.endsWith(E2E_DB_SUFFIX) || name === E2E_DB_SUFFIX) {
        throw new Error(`Refusing to reset ${name}: not an e2e database`);
    }
    // Connect through the dev database on the same server: the e2e one may not exist yet, and Prisma
    // refuses the `mysql` system database.
    url.pathname = `/${name.slice(0, -E2E_DB_SUFFIX.length)}`;
    execFileSync('prisma', ['db', 'execute', '--stdin'], {
        input: `DROP DATABASE IF EXISTS \`${name}\`; CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
        stdio: ['pipe', 'inherit', 'inherit'],
        env: { ...process.env, DATABASE_URL: url.toString() },
    });
}
