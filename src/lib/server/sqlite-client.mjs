// Generates a SQLite Prisma client into src/generated/prisma-sqlite, independent of the provider the
// app's own client (src/generated/prisma) was generated for. Development may run on MariaDB, but the
// DB-backed unit tests (`test-db.ts`) always use a temporary SQLite file, and `db:copy` reads an SQLite
// database with it. Vitest runs this as global setup; `db:copy` calls `ensureSqliteClient()`.
// Regenerates only when schema.base.prisma changed since the last run.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderSchema } from '../../../prisma/provider.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const OUTPUT = `${root}src/generated/prisma-sqlite`;
const SCHEMA_DIR = `${root}node_modules/.cache/sic-sqlite-prisma`;
const STAMP = `${OUTPUT}/.schema-hash`;

export function ensureSqliteClient() {
    const base = readFileSync(`${root}prisma/schema.base.prisma`, 'utf8');
    const hash = createHash('sha256').update(base).digest('hex');
    if (existsSync(STAMP) && readFileSync(STAMP, 'utf8') === hash) return;

    mkdirSync(SCHEMA_DIR, { recursive: true });
    const schema = `${SCHEMA_DIR}/schema.prisma`;
    writeFileSync(schema, renderSchema(base, 'sqlite', { output: OUTPUT }));
    // The project's own CLI, so this works without `node_modules/.bin` on PATH (bare `vp test`, `node …`).
    execFileSync(`${root}node_modules/.bin/prisma`, ['generate', '--schema', schema], {
        cwd: root,
        stdio: 'inherit',
        // `prisma generate` loads prisma.config.ts, which needs a DATABASE_URL; any SQLite URL will do.
        env: { ...process.env, DATABASE_URL: 'file:./storage/test.db' },
    });
    writeFileSync(STAMP, hash);
}

export default ensureSqliteClient;

// `node src/lib/server/sqlite-client.mjs` (postinstall, setup): type checks import this client too.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) ensureSqliteClient();
