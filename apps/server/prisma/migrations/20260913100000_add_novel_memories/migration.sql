-- Author-editable structured memories for the novel knowledge base.
CREATE TYPE "NovelMemoryType" AS ENUM (
    'CHARACTER',
    'RELATIONSHIP',
    'WORLDVIEW',
    'TIMELINE',
    'FORESHADOWING'
);

CREATE TABLE "NovelMemory" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "type" "NovelMemoryType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NovelMemory_novelId_type_orderIndex_idx"
ON "NovelMemory"("novelId", "type", "orderIndex");

CREATE INDEX "NovelMemory_sourceChapterId_idx"
ON "NovelMemory"("sourceChapterId");

ALTER TABLE "NovelMemory"
ADD CONSTRAINT "NovelMemory_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovelMemory"
ADD CONSTRAINT "NovelMemory_sourceChapterId_fkey"
FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
