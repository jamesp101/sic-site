/**
 * Deletes stored files that no database row references and that are older than 24 h, and sweeps
 * expired pending direct uploads.
 *
 *   vp run storage:cleanup              # delete
 *   vp run storage:cleanup -- --dry-run # list what would be deleted, delete nothing
 *
 * For a system cron on a self-hosted server; Vercel uses /api/cron/storage-cleanup.
 */
import { formatCleanupReport } from '../src/lib/server/storage-cleanup';
import { runStorageCleanup } from '../src/lib/server/storage-cleanup-run';
import { db } from '../src/lib/server/db';

const dryRun = process.argv.includes('--dry-run');
try {
    // A scheduled run keeps going until the work is done; only the HTTP route has to fit a function timeout.
    const report = await runStorageCleanup({ dryRun, maxDeletes: Infinity, budgetMs: Infinity });
    console.log(formatCleanupReport(report));
} finally {
    await db.$disconnect();
}
