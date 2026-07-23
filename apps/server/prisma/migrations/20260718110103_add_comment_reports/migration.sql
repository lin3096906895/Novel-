-- CreateTable
CREATE TABLE "CommentReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "commentId" TEXT,
    "reason" "ParagraphReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ParagraphReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "contentSnapshot" TEXT NOT NULL,
    "commentAuthorId" TEXT NOT NULL,
    "commentAuthorNickname" TEXT NOT NULL,
    "commentAuthorEmail" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "novelTitle" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentReport_status_createdAt_idx" ON "CommentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommentReport_commentId_status_idx" ON "CommentReport"("commentId", "status");

-- CreateIndex
CREATE INDEX "CommentReport_chapterId_status_idx" ON "CommentReport"("chapterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReport_reporterId_commentId_key" ON "CommentReport"("reporterId", "commentId");

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
