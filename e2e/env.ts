import 'dotenv/config';
import { providerFromUrl } from '../prisma/provider.mjs';

// E2E_PORT lets several runs coexist: each gets its own server, DB and uploads dir.
export const PORT = Number(process.env.E2E_PORT ?? 4399);
/** UPLOAD_DIR of the e2e server (STORAGE_DRIVER=local). */
export const UPLOADS = `storage/e2e-uploads-${PORT}`;

/** Suffix of the e2e database name on a MariaDB/MySQL server: `<dev db>_e2e_<port>`. */
export const E2E_DB_SUFFIX = `_e2e_${PORT}`;
const E2E_FILE = `file:./storage/e2e-${PORT}.db`;

/**
 * The e2e server's database, never the dev database. The build's Prisma client only works with the
 * provider it was generated for (DATABASE_URL), so the e2e database uses that provider: an SQLite file
 * next to the dev one, or a `<dev db>_e2e_<port>` database on the same MariaDB/MySQL server.
 * E2E_DATABASE_URL (e.g. a CI database service) replaces it. Idempotent: the web server's own processes
 * already run with the e2e URL as DATABASE_URL.
 */
function e2eDatabaseUrl(dev: string | undefined): string {
    if (!dev || providerFromUrl(dev) === 'sqlite') return E2E_FILE;
    const url = new URL(dev);
    if (!url.pathname.endsWith(E2E_DB_SUFFIX)) url.pathname += E2E_DB_SUFFIX;
    return url.toString();
}

export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? e2eDatabaseUrl(process.env.DATABASE_URL);
