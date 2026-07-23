-- CreateEnum
CREATE TYPE "ParagraphReportReason" AS ENUM ('SPAM', 'ABUSE', 'SPOILER', 'OTHER');

-- CreateEnum
CREATE TYPE "ParagraphReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ParagraphCommentReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reason" "ParagraphReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ParagraphReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParagraphCommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParagraphCommentReport_status_createdAt_idx" ON "ParagraphCommentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ParagraphCommentReport_commentId_status_idx" ON "ParagraphCommentReport"("commentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ParagraphCommentReport_reporterId_commentId_key" ON "ParagraphCommentReport"("reporterId", "commentId");

-- AddForeignKey
ALTER TABLE "ParagraphCommentReport" ADD CONSTRAINT "ParagraphCommentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParagraphCommentReport" ADD CONSTRAINT "ParagraphCommentReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParagraphCommentReport" ADD CONSTRAINT "ParagraphCommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ParagraphComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
