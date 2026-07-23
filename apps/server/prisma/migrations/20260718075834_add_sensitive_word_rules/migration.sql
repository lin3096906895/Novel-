-- CreateEnum
CREATE TYPE "SensitiveWordScope" AS ENUM ('ALL', 'NOVEL', 'CHAPTER', 'COMMENT');

-- CreateTable
CREATE TABLE "SensitiveWordRule" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "scope" "SensitiveWordScope" NOT NULL DEFAULT 'ALL',
    "note" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitiveWordRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensitiveWordRule_scope_isEnabled_updatedAt_idx" ON "SensitiveWordRule"("scope", "isEnabled", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SensitiveWordRule_normalizedTerm_scope_key" ON "SensitiveWordRule"("normalizedTerm", "scope");

-- AddForeignKey
ALTER TABLE "SensitiveWordRule" ADD CONSTRAINT "SensitiveWordRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
