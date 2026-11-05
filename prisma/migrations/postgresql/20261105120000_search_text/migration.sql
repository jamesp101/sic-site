-- AlterTable
ALTER TABLE "hero_sections" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';
