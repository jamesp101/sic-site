/**
 * Storage cleanup: deletes stored files that no database row references and that are older than a
 * grace period, plus expired pending-upload rows (never their files directly). Free of `astro:*` imports; the database,
 * driver and delete function are injected (wired in `storage-cleanup-run.ts`).
 *
 * "Referenced" is decided generically: a file is kept when its key appears, as a bare key or inside
 * any URL form (`/storage/<key>`, the S3_PUBLIC_URL form), in ANY string column of ANY model in the
 * Prisma data model. New columns are therefore covered without touching this module. Files younger
 * than the grace period are never touched, so an upload whose row is not committed yet is safe.
 */
import type { PrismaClient } from '../../generated/prisma/client';
import { modelDelegate, prismaModels } from './prisma-models';
import type { StorageDriver } from './storage/types';

export const GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_DELETES = 1000;
const DEFAULT_BUDGET_MS = 40_000;
const SCAN_BATCH = 500;
const DELETE_CHUNK = 25;
const SWEEP_ROUNDS = 20;

type Row = Record<string, unknown>;
interface Delegate {
    findMany(args: {
        select: Record<string, true>;
        orderBy: { id: 'asc' };
        take: number;
        where?: object;
    }): Promise<Row[]>;
}

export interface CleanupDeps {
    /** The Prisma client. */
    db: PrismaClient;
    driver: Pick<StorageDriver, 'list'>;
    /** Removes stored files; must log and never throw (`discardFiles`). */
    discard(keys: readonly string[], context: string): Promise<void>;
    /** Deletes the expired pending-upload rows (never their files) and returns how many it removed. */
    sweepPending(): Promise<number>;
    /** Counts the rows a sweep would remove, without removing them (dry run). */
    countExpiredPending(): Promise<number>;
    /** Rows that expired at or before this instant are removed by a sweep. */
    pendingSweepCutoff(now: number): Date;
}

export interface CleanupOptions {
    dryRun?: boolean;
    now?: number;
    graceMs?: number;
    /** Most files deleted in one run; the next run continues. */
    maxDeletes?: number;
    /** Wall-clock budget for deleting, so a run fits a serverless timeout. */
    budgetMs?: number;
}

export interface CleanupReport {
    dryRun: boolean;
    /** Files listed in the store. */
    listed: number;
    /** Files old enough to be considered. */
    candidates: number;
    /** Candidates some row still references. */
    referenced: number;
    /** Unreferenced candidates left for the next run (cap or time budget). */
    remaining: number;
    /** Files deleted (dry run: files that would be deleted). */
    deleted: number;
    bytesFreed: number;
    /** Expired pending direct uploads swept (dry run: found). */
    pendingUploads: number;
    keys: string[];
}

interface StringTable {
    delegate: string;
    columns: string[];
}

/** Every model with its String columns, from the Prisma client's own data model. Every model has an `id` primary key. */
export function stringTables(db: PrismaClient): StringTable[] {
    return prismaModels(db)
        .map((model) => ({
            delegate: model.delegate,
            columns: model.fields
                .filter((field) => field.kind === 'scalar' && field.type === 'String')
                .map((field) => field.name),
        }))
        .filter((table) => table.columns.length > 0);
}

const SAFE_KEY = /^[\w.\-/]+$/;
const TOKEN = /[^\s"'`()<>[\]{},;|\\?#]+/g;

/** Finds which `keys` occur in `text` as a bare key or as the tail of a URL/path. */
export class KeyMatcher {
    private readonly plain: Set<string>;
    private readonly unusual: string[];

    constructor(keys: Iterable<string>) {
        const all = [...keys];
        this.plain = new Set(all.filter((key) => SAFE_KEY.test(key)));
        this.unusual = all.filter((key) => !SAFE_KEY.test(key));
    }

    find(text: string, onHit: (key: string) => void): void {
        const normalised = text.replaceAll('\\/', '/');
        for (const [token] of normalised.matchAll(TOKEN)) {
            if (!token.includes('/')) continue;
            const parts = token.split('/');
            // `https://cdn/prefix/posts/a.webp` and `/storage/posts/a.webp` both end in the key.
            for (let i = 0; i < parts.length; i++) {
                const suffix = parts.slice(i).join('/');
                if (this.plain.has(suffix)) onHit(suffix);
            }
        }
        for (const key of this.unusual) {
            if (normalised.includes(key) || normalised.includes(encodeURI(key))) onHit(key);
        }
    }
}

/** Removes from `unreferenced` every key found in a String column of any table. Returns the number of rows scanned. */
async function scanReferences(
    db: PrismaClient,
    unreferenced: Map<string, number>,
    /** Dry run: pending-upload rows expired at or before this are skipped, as the real run sweeps them first. */
    ignoreExpiredPendingBefore?: Date,
): Promise<void> {
    const tables = stringTables(db);
    if (tables.length === 0) throw new Error('Prisma data model not available: refusing to clean up.');
    const matcher = new KeyMatcher(unreferenced.keys());
    for (const table of tables) {
        const delegate = modelDelegate<Delegate>(db, table.delegate);
        if (!delegate) throw new Error(`No Prisma delegate for ${table.delegate}: refusing to clean up.`);
        const select = Object.fromEntries([['id', true as const], ...table.columns.map((c) => [c, true as const])]);
        let afterId = 0;
        for (;;) {
            if (unreferenced.size === 0) return;
            const idFilter = afterId ? { id: { gt: afterId } } : {};
            const sweepable =
                ignoreExpiredPendingBefore && table.delegate === 'pendingUpload'
                    ? { expiresAt: { gt: ignoreExpiredPendingBefore } }
                    : {};
            const rows = await delegate.findMany({
                select,
                orderBy: { id: 'asc' },
                take: SCAN_BATCH,
                where: { ...idFilter, ...sweepable },
            });
            if (rows.length === 0) break;
            for (const row of rows) {
                for (const column of table.columns) {
                    const value = row[column];
                    if (typeof value === 'string' && value) matcher.find(value, (key) => unreferenced.delete(key));
                }
            }
            afterId = rows[rows.length - 1].id as number;
            if (rows.length < SCAN_BATCH) break;
        }
    }
}

/** Deletes (or, in a dry run, lists) unreferenced old files and sweeps expired pending uploads. */
export async function cleanupStorage(deps: CleanupDeps, options: CleanupOptions = {}): Promise<CleanupReport> {
    const startedAt = Date.now();
    const now = options.now ?? startedAt;
    const dryRun = options.dryRun ?? false;
    const cutoff = now - (options.graceMs ?? GRACE_MS);
    const maxDeletes = options.maxDeletes ?? DEFAULT_MAX_DELETES;
    const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    const timeLeft = () => startedAt + budgetMs - Date.now();

    // Expired pending uploads go first: their rows (which reference the key) disappear with them.
    let pendingUploads = 0;
    if (dryRun) {
        pendingUploads = await deps.countExpiredPending();
    } else {
        for (let round = 0; round < SWEEP_ROUNDS && timeLeft() > 0; round++) {
            const swept = await deps.sweepPending();
            if (swept === 0) break;
            pendingUploads += swept;
        }
    }

    let listed = 0;
    const candidates = new Map<string, { size: number; mtime: number }>();
    for await (const object of deps.driver.list()) {
        listed++;
        if (object.mtime.getTime() <= cutoff)
            candidates.set(object.key, { size: object.size, mtime: object.mtime.getTime() });
    }
    const candidateCount = candidates.size;

    const unreferenced = new Map([...candidates].map(([key, info]) => [key, info.size]));
    await scanReferences(deps.db, unreferenced, dryRun ? deps.pendingSweepCutoff(now) : undefined);

    const ordered = [...unreferenced.keys()].sort((a, b) => candidates.get(a)!.mtime - candidates.get(b)!.mtime);
    const keys: string[] = [];
    let bytesFreed = 0;
    for (let i = 0; i < ordered.length && keys.length < maxDeletes; i += DELETE_CHUNK) {
        if (!dryRun && timeLeft() <= 0) break;
        const chunk = ordered.slice(i, Math.min(i + DELETE_CHUNK, i + (maxDeletes - keys.length)));
        if (!dryRun) await deps.discard(chunk, 'unreferenced file');
        keys.push(...chunk);
        for (const key of chunk) bytesFreed += unreferenced.get(key) ?? 0;
    }

    return {
        dryRun,
        listed,
        candidates: candidateCount,
        referenced: candidateCount - unreferenced.size,
        remaining: ordered.length - keys.length,
        deleted: keys.length,
        bytesFreed,
        pendingUploads,
        keys,
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human-readable summary; a dry run lists the keys. */
export function formatCleanupReport(report: CleanupReport): string {
    const verb = report.dryRun ? 'Would delete' : 'Deleted';
    const lines = [
        `Stored files: ${report.listed} (${report.candidates} older than the grace period, ${report.referenced} still referenced)`,
        `${verb} ${report.deleted} unreferenced file(s), ${formatBytes(report.bytesFreed)}`,
        `${report.dryRun ? 'Expired pending uploads found' : 'Expired pending uploads swept'}: ${report.pendingUploads}`,
    ];
    if (report.remaining > 0) lines.push(`Left for the next run: ${report.remaining}`);
    if (report.dryRun) lines.push(...report.keys.map((key) => `  ${key}`));
    return lines.join('\n');
}
