/**
 * Creates the missing card variants (`<key>.w640.webp`) of stored Highlight images. Run once after deploying
 * variants to existing data; safe to run again (existing variants are kept).
 *
 *   vp run storage:variants
 */
import { backfillVariants } from '../src/lib/server/image-variant';

const report = await backfillVariants();
console.log(
    `Variants created: ${report.created}, already there: ${report.existing}, skipped: ${report.skipped.length}`,
);
for (const { key, reason } of report.skipped) console.log(`  ${key}: ${reason}`);
