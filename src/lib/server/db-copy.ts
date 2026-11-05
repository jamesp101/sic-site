/**
 * Copies every row of every model from one database into another, empty one: ids, dates, booleans and
 * BigInts unchanged, through two Prisma clients so each side converts its own column types. Used by
 * `vp run db:copy` (scripts/db-copy.ts) to move the SQLite dev database into MariaDB. Free of `astro:*` imports.
 *
 * Rows are written in one transaction with foreign-key checks deferred, so tables and self-references
 * (members, navigation links) can be copied in any order; the target keeps allocating ids after the copied
 * ones. A target that already has rows is refused, so a copy never merges into or overwrites real data.
 */
import type { PrismaClient } from '../../generated/prisma/client';
import { modelDelegate, prismaModels } from './prisma-models';

/** Providers a copy can write to: each needs a way to defer foreign-key checks inside one transaction. */
export type CopyTarget = 'sqlite' | 'mysql';

export interface CopiedModel {
    model: string;
    rows: number;
}

type Row = Record<string, unknown>;

interface CopyDelegate {
    count(): Promise<number>;
    findMany(args: { orderBy: { id: 'asc' }; skip: number; take: number }): Promise<Row[]>;
    createMany(args: { data: Row[] }): Promise<{ count: number }>;
}

const BATCH = 200;

/** Statements that switch foreign-key checks off for the copy's connection, and back on. */
const FOREIGN_KEYS: Record<CopyTarget, { off: string; on: string | null }> = {
    // Deferred checks run at commit, when every row is in place; the pragma ends with the transaction.
    sqlite: { off: 'PRAGMA defer_foreign_keys = ON', on: null },
    // Session setting on the transaction's connection: restore it before the connection goes back to the pool.
    mysql: { off: 'SET FOREIGN_KEY_CHECKS = 0', on: 'SET FOREIGN_KEY_CHECKS = 1' },
};

function delegateOf(client: object, model: { name: string; delegate: string }): CopyDelegate {
    const delegate = modelDelegate<CopyDelegate>(client, model.delegate);
    if (!delegate) throw new Error(`No Prisma delegate for ${model.name}`);
    return delegate;
}

export async function copyDatabase(
    source: PrismaClient,
    target: PrismaClient,
    provider: CopyTarget,
): Promise<CopiedModel[]> {
    const models = prismaModels(target);
    const nonEmpty: string[] = [];
    for (const model of models) {
        if ((await delegateOf(target, model).count()) > 0) nonEmpty.push(model.name);
    }
    if (nonEmpty.length > 0) {
        throw new Error(
            `The target database is not empty (rows in ${nonEmpty.join(', ')}); copy into an empty, migrated database.`,
        );
    }

    const keys = FOREIGN_KEYS[provider];
    return target.$transaction(
        async (tx) => {
            await tx.$executeRawUnsafe(keys.off);
            try {
                const copied: CopiedModel[] = [];
                for (const model of models) {
                    const from = delegateOf(source, model);
                    const to = delegateOf(tx, model);
                    let rows = 0;
                    for (let skip = 0; ; skip += BATCH) {
                        const batch = await from.findMany({ orderBy: { id: 'asc' }, skip, take: BATCH });
                        if (batch.length === 0) break;
                        rows += (await to.createMany({ data: batch })).count;
                    }
                    copied.push({ model: model.name, rows });
                }
                return copied;
            } finally {
                if (keys.on) await tx.$executeRawUnsafe(keys.on);
            }
        },
        { maxWait: 30_000, timeout: 10 * 60_000 },
    );
}
