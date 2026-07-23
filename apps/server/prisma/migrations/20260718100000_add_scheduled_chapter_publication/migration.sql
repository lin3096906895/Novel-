-- AlterEnum
ALTER TYPE "ChapterStatus" ADD VALUE 'SCHEDULED' BEFORE 'PUBLISHED';

-- AddColumn
ALTER TABLE "Chapter" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- AddIndex
CREATE INDEX "Chapter_status_scheduledAt_idx" ON "Chapter"("status", "scheduledAt");
