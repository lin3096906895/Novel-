-- CreateEnum
CREATE TYPE "ContentAppealTargetType" AS ENUM ('NOVEL', 'CHAPTER');

-- CreateEnum
CREATE TYPE "ContentAppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ContentAppeal" (
    "id" TEXT NOT NULL,
    "appellantId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "targetType" "ContentAppealTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetTitle" TEXT NOT NULL,
    "sourceReportId" TEXT,
    "sourceAuditId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ContentAppealStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentAppeal_sourceAuditId_key" ON "ContentAppeal"("sourceAuditId");

-- CreateIndex
CREATE INDEX "ContentAppeal_appellantId_createdAt_idx" ON "ContentAppeal"("appellantId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentAppeal_status_createdAt_idx" ON "ContentAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentAppeal_targetType_targetId_status_idx" ON "ContentAppeal"("targetType", "targetId", "status");

-- AddForeignKey
ALTER TABLE "ContentAppeal" ADD CONSTRAINT "ContentAppeal_appellantId_fkey" FOREIGN KEY ("appellantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAppeal" ADD CONSTRAINT "ContentAppeal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAppeal" ADD CONSTRAINT "ContentAppeal_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "ContentReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAppeal" ADD CONSTRAINT "ContentAppeal_sourceAuditId_fkey" FOREIGN KEY ("sourceAuditId") REFERENCES "AdminAuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
