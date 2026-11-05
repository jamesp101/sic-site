/**
 * Test-only harness: a PrismaClient on a temporary SQLite file built from `prisma/migrations/sqlite/*`.
 * Use it to test database-backed server code against a real database instead of mocks. `vi.mock` is
 * hoisted above imports, so the factory loads this module itself:
 *
 *   vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));
 *   afterAll(closeTestDb);
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';

const MIGRATIONS = path.resolve(import.meta.dirname, '../../../prisma/migrations/sqlite');

let open: { db: PrismaClient; dir: string } | undefined;

/** Applies every sqlite migration, in folder-name order, to the database behind `adapter`. */
async function migrate(adapter: PrismaBetterSqlite3) {
    const connection = await adapter.connect();
    try {
        const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        for (const folder of folders) {
            await connection.executeScript(readFileSync(path.join(MIGRATIONS, folder, 'migration.sql'), 'utf8'));
        }
    } finally {
        await connection.dispose();
    }
}

/** Opens (once per test file) a migrated, empty temporary database and returns its client. */
export async function openTestDb(): Promise<PrismaClient> {
    if (open) return open.db;
    const dir = mkdtempSync(path.join(tmpdir(), 'sic-test-db-'));
    const url = `file:${path.join(dir, 'test.db')}`;
    await migrate(new PrismaBetterSqlite3({ url }));
    open = { db: new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) }), dir };
    return open.db;
}

/** Disconnects the client and deletes the temporary database. */
export async function closeTestDb(): Promise<void> {
    if (!open) return;
    const { db, dir } = open;
    open = undefined;
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
}
