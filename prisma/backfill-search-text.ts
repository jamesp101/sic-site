/**
 * Recomputes `search_text` for every post and hero section from its content.
 *
 *   tsx prisma/backfill-search-text.ts
 *
 * `updated_at` is left as it was. Run once after `prisma migrate deploy` added the column (new rows are filled on save). Safe to re-run.
 */
import { searchTextOf } from '../src/lib/blocks/content';
import { db } from '../src/lib/server/db';

const BATCH = 100;

async function backfill(
    label: string,
    page: (afterId: number) => Promise<{ id: number; content: string; searchText: string; updatedAt: Date }[]>,
    save: (id: number, searchText: string, updatedAt: Date) => Promise<unknown>,
) {
    let afterId = 0;
    let changed = 0;
    let total = 0;
    for (;;) {
        const rows = await page(afterId);
        if (rows.length === 0) break;
        for (const row of rows) {
            const searchText = searchTextOf(row.content);
            if (searchText !== row.searchText) {
                await save(row.id, searchText, row.updatedAt);
                changed++;
            }
        }
        total += rows.length;
        afterId = rows[rows.length - 1].id;
    }
    console.log(`${label}: ${changed} of ${total} updated.`);
}

async function main() {
    await backfill(
        'posts',
        (afterId) =>
            db.post.findMany({
                where: { id: { gt: afterId } },
                orderBy: { id: 'asc' },
                take: BATCH,
                select: { id: true, content: true, searchText: true, updatedAt: true },
            }),
        (id, searchText, updatedAt) =>
            db.post.update({ where: { id }, data: { searchText, updatedAt }, select: { id: true } }),
    );
    await backfill(
        'hero sections',
        (afterId) =>
            db.heroSection.findMany({
                where: { id: { gt: afterId } },
                orderBy: { id: 'asc' },
                take: BATCH,
                select: { id: true, content: true, searchText: true, updatedAt: true },
            }),
        (id, searchText, updatedAt) =>
            db.heroSection.update({ where: { id }, data: { searchText, updatedAt }, select: { id: true } }),
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
