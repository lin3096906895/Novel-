-- CreateEnum
CREATE TYPE "ChapterVersionSource" AS ENUM ('MANUAL', 'AUTOSAVE', 'SUBMIT', 'RESTORE');

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Recycle-bin chapters keep their previous order for display. Only active chapter order is unique.
DROP INDEX "Chapter_novelId_orderIndex_key";
CREATE INDEX "Chapter_novelId_orderIndex_idx" ON "Chapter"("novelId", "orderIndex");
CREATE UNIQUE INDEX "Chapter_active_order_key"
ON "Chapter"("novelId", "orderIndex")
WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Chapter_novelId_deletedAt_idx" ON "Chapter"("novelId", "deletedAt");

-- CreateTable
CREATE TABLE "ChapterVersion" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "volumeId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "wordCount" INTEGER NOT NULL,
    "source" "ChapterVersionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterVersion_chapterId_createdAt_idx" ON "ChapterVersion"("chapterId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChapterVersion" ADD CONSTRAINT "ChapterVersion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permanent chapter deletion should also clear the user's stale reading position.
ALTER TABLE "ReadingHistory" DROP CONSTRAINT "ReadingHistory_chapterId_fkey";
ALTER TABLE "ReadingHistory" ADD CONSTRAINT "ReadingHistory_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
