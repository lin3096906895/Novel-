-- CreateEnum
CREATE TYPE "AuthorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AuthorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "penName" TEXT NOT NULL,
    "bio" TEXT,
    "statement" TEXT NOT NULL,
    "status" "AuthorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorApplication_userId_key" ON "AuthorApplication"("userId");

-- CreateIndex
CREATE INDEX "AuthorApplication_status_createdAt_idx" ON "AuthorApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuthorApplication_reviewedById_reviewedAt_idx" ON "AuthorApplication"("reviewedById", "reviewedAt");

-- AddForeignKey
ALTER TABLE "AuthorApplication" ADD CONSTRAINT "AuthorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorApplication" ADD CONSTRAINT "AuthorApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
