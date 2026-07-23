-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deletionScheduledAt_deletedAt_idx" ON "User"("deletionScheduledAt", "deletedAt");
