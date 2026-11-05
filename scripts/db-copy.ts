/**
 * Copies an SQLite database into the empty, migrated database at DATABASE_URL (MariaDB/MySQL, or another
 * SQLite file): every row of every table, ids unchanged. Uploaded files are not touched; they stay in
 * UPLOAD_DIR or the bucket under the same keys.
 *
 *   vp run db:deploy                                   # migrate the target first
 *   vp run db:copy                                     # from file:./storage/dev.db
 *   vp run db:copy -- --from file:./storage/other.db
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { copyDatabase, type CopyTarget } from '../src/lib/server/db-copy';
import { db, dbProvider } from '../src/lib/server/db';
import { ensureSqliteClient } from '../src/lib/server/sqlite-client.mjs';

const fromIndex = process.argv.indexOf('--from');
const from = fromIndex === -1 ? 'file:./storage/dev.db' : process.argv[fromIndex + 1];
if (!from?.startsWith('file:')) throw new Error('--from must be an SQLite URL (file:…)');
if (dbProvider === 'postgresql') throw new Error('db:copy writes to MariaDB/MySQL or SQLite, not PostgreSQL');
const target: CopyTarget = dbProvider;
if (target === 'sqlite' && process.env.DATABASE_URL === from)
    throw new Error('Source and target are the same database');

ensureSqliteClient();
// Imported after `ensureSqliteClient()` has generated it: the module may not exist before that call.
const { PrismaClient: SqliteClient } = await import('../src/generated/prisma-sqlite/client');
const source = new SqliteClient({ adapter: new PrismaBetterSqlite3({ url: from }) });

try {
    // Both clients come from the same models; the source is typed as the app's client.
    const copied = await copyDatabase(source as unknown as typeof db, db, target);
    for (const { model, rows } of copied) console.log(`${model.padEnd(20)} ${rows}`);
    console.log(
        `Copied ${copied.reduce((sum, row) => sum + row.rows, 0)} rows from ${from} into the ${target} database.`,
    );
} finally {
    await Promise.all([source.$disconnect(), db.$disconnect()]);
}
