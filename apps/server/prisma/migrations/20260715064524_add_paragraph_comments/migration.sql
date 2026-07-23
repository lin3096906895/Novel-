-- CreateTable
CREATE TABLE "ParagraphComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "paragraphIndex" INTEGER NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParagraphComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParagraphCommentLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParagraphCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParagraphComment_chapterId_paragraphIndex_parentId_createdA_idx" ON "ParagraphComment"("chapterId", "paragraphIndex", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ParagraphComment_parentId_createdAt_idx" ON "ParagraphComment"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ParagraphComment_userId_createdAt_idx" ON "ParagraphComment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ParagraphCommentLike_commentId_createdAt_idx" ON "ParagraphCommentLike"("commentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParagraphCommentLike_userId_commentId_key" ON "ParagraphCommentLike"("userId", "commentId");

-- AddForeignKey
ALTER TABLE "ParagraphComment" ADD CONSTRAINT "ParagraphComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParagraphComment" ADD CONSTRAINT "ParagraphComment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParagraphComment" ADD CONSTRAINT "ParagraphComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ParagraphComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParagraphCommentLike" ADD CONSTRAINT "ParagraphCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParagraphCommentLike" ADD CONSTRAINT "ParagraphCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ParagraphComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
