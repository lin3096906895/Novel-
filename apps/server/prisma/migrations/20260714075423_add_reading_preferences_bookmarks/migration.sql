-- CreateTable
CREATE TABLE "ReadingPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fontSize" INTEGER NOT NULL DEFAULT 18,
    "theme" TEXT NOT NULL DEFAULT 'LIGHT',
    "lineHeight" DOUBLE PRECISION NOT NULL DEFAULT 1.9,
    "contentWidth" INTEGER NOT NULL DEFAULT 760,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingPreference_userId_key" ON "ReadingPreference"("userId");

-- CreateIndex
CREATE INDEX "ChapterBookmark_userId_createdAt_idx" ON "ChapterBookmark"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterBookmark_userId_chapterId_key" ON "ChapterBookmark"("userId", "chapterId");

-- AddForeignKey
ALTER TABLE "ReadingPreference" ADD CONSTRAINT "ReadingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterBookmark" ADD CONSTRAINT "ChapterBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterBookmark" ADD CONSTRAINT "ChapterBookmark_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
