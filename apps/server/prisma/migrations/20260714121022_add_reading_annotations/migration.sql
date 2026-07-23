-- CreateTable
CREATE TABLE "ReadingAnnotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "paragraphIndex" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "selectedText" TEXT NOT NULL,
    "note" TEXT,
    "color" TEXT NOT NULL DEFAULT 'YELLOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingAnnotation_userId_chapterId_paragraphIndex_idx" ON "ReadingAnnotation"("userId", "chapterId", "paragraphIndex");

-- CreateIndex
CREATE INDEX "ReadingAnnotation_userId_updatedAt_idx" ON "ReadingAnnotation"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ReadingAnnotation" ADD CONSTRAINT "ReadingAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingAnnotation" ADD CONSTRAINT "ReadingAnnotation_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
