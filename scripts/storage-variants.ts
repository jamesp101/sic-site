/**
 * Creates the missing variants (`<key>.w640.webp` for Highlight images, `<key>.w960.webp` for Slide photos,
 * `<key>.w128.webp` for Department logos and Member portraits) of stored images. Run once after deploying variants
 * to existing data; safe to run again (existing variants are kept).
 *
 *   vp run storage:variants
 */
import { db } from '../src/lib/server/db';
import { backfillVariants } from '../src/lib/server/image-variant';

const slides = await db.carouselItem.findMany({ select: { imagePath: true } });
const report = await backfillVariants(
    undefined,
    slides.map((slide) => slide.imagePath),
).finally(() => db.$disconnect());
console.log(
    `Variants created: ${report.created}, already there: ${report.existing}, skipped: ${report.skipped.length}`,
);
for (const { key, reason } of report.skipped) console.log(`  ${key}: ${reason}`);
