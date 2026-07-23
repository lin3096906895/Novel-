-- AddTable
CREATE TABLE "NovelVolume" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelVolume_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "Chapter" ADD COLUMN "volumeId" TEXT;

-- Preserve existing catalogs by placing every current chapter in a default volume.
INSERT INTO "NovelVolume" ("id", "novelId", "title", "orderIndex", "createdAt", "updatedAt")
SELECT 'volume_' || substr(md5("id"), 1, 24), "id", '正文', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Novel";

UPDATE "Chapter" AS chapter
SET "volumeId" = volume."id"
FROM "NovelVolume" AS volume
WHERE volume."novelId" = chapter."novelId" AND volume."orderIndex" = 1;

-- AddIndex
CREATE UNIQUE INDEX "NovelVolume_novelId_orderIndex_key" ON "NovelVolume"("novelId", "orderIndex");

-- AddIndex
CREATE INDEX "NovelVolume_novelId_orderIndex_idx" ON "NovelVolume"("novelId", "orderIndex");

-- AddIndex
CREATE INDEX "Chapter_volumeId_orderIndex_idx" ON "Chapter"("volumeId", "orderIndex");

-- AddForeignKey
ALTER TABLE "NovelVolume" ADD CONSTRAINT "NovelVolume_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "NovelVolume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
