-- CreateTable
CREATE TABLE "ChapterRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterRead_userId_completedAt_idx" ON "ChapterRead"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "ChapterRead_chapterId_completedAt_idx" ON "ChapterRead"("chapterId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterRead_userId_chapterId_key" ON "ChapterRead"("userId", "chapterId");

-- AddForeignKey
ALTER TABLE "ChapterRead" ADD CONSTRAINT "ChapterRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRead" ADD CONSTRAINT "ChapterRead_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
