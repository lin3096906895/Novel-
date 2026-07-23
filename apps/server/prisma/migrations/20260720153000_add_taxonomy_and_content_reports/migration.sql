-- CreateEnum
CREATE TYPE "ContentReportTargetType" AS ENUM ('NOVEL', 'CHAPTER', 'AUTHOR', 'USER');

-- CreateTable
CREATE TABLE "ContentChannel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentChannel_pkey" PRIMARY KEY ("id")
);

-- Seed the channels that were previously hard-coded in MetaController.
INSERT INTO "ContentChannel" ("id", "code", "name", "sortOrder", "updatedAt") VALUES
    ('channel_male', 'male', '男频', 10, CURRENT_TIMESTAMP),
    ('channel_female', 'female', '女频', 20, CURRENT_TIMESTAMP),
    ('channel_short', 'short', '短篇', 30, CURRENT_TIMESTAMP),
    ('channel_published', 'published', '出版', 40, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Tag"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ContentReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetTitle" TEXT NOT NULL,
    "targetOwnerId" TEXT,
    "targetSnapshot" JSONB NOT NULL,
    "reason" "ParagraphReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ParagraphReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentChannel_code_key" ON "ContentChannel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ContentChannel_name_key" ON "ContentChannel"("name");

-- CreateIndex
CREATE INDEX "ContentChannel_sortOrder_name_idx" ON "ContentChannel"("sortOrder", "name");

-- CreateIndex
CREATE INDEX "Category_channel_sortOrder_idx" ON "Category"("channel", "sortOrder");

-- CreateIndex
CREATE INDEX "Tag_sortOrder_name_idx" ON "Tag"("sortOrder", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_reporterId_targetType_targetId_key" ON "ContentReport"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_targetType_targetId_status_idx" ON "ContentReport"("targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "ContentReport_targetOwnerId_status_idx" ON "ContentReport"("targetOwnerId", "status");

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
