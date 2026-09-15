CREATE TYPE "NovelMemoryDraftStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "NovelMemoryConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "NovelMemoryDraft" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "type" "NovelMemoryType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "confidence" "NovelMemoryConfidence" NOT NULL,
    "evidence" TEXT,
    "status" "NovelMemoryDraftStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedMemoryId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelMemoryDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NovelMemoryDraft_acceptedMemoryId_key"
ON "NovelMemoryDraft"("acceptedMemoryId");

CREATE INDEX "NovelMemoryDraft_novelId_status_createdAt_idx"
ON "NovelMemoryDraft"("novelId", "status", "createdAt");

CREATE INDEX "NovelMemoryDraft_sourceChapterId_idx"
ON "NovelMemoryDraft"("sourceChapterId");

ALTER TABLE "NovelMemoryDraft"
ADD CONSTRAINT "NovelMemoryDraft_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovelMemoryDraft"
ADD CONSTRAINT "NovelMemoryDraft_sourceChapterId_fkey"
FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NovelMemoryDraft"
ADD CONSTRAINT "NovelMemoryDraft_acceptedMemoryId_fkey"
FOREIGN KEY ("acceptedMemoryId") REFERENCES "NovelMemory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
