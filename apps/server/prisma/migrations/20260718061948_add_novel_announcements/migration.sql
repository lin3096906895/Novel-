-- CreateTable
CREATE TABLE "NovelAnnouncement" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NovelAnnouncement_novelId_isPinned_publishedAt_idx" ON "NovelAnnouncement"("novelId", "isPinned", "publishedAt");

-- CreateIndex
CREATE INDEX "NovelAnnouncement_novelId_updatedAt_idx" ON "NovelAnnouncement"("novelId", "updatedAt");

-- AddForeignKey
ALTER TABLE "NovelAnnouncement" ADD CONSTRAINT "NovelAnnouncement_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
