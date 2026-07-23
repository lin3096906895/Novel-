-- DropForeignKey
ALTER TABLE "ReadingHistory" DROP CONSTRAINT "ReadingHistory_chapterId_fkey";

-- CreateTable
CREATE TABLE "TwoFactorCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorLoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "deviceName" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorCredential_userId_key" ON "TwoFactorCredential"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorCredential_enabledAt_idx" ON "TwoFactorCredential"("enabledAt");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_credentialId_usedAt_idx" ON "TwoFactorRecoveryCode"("credentialId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_credentialId_codeHash_key" ON "TwoFactorRecoveryCode"("credentialId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorLoginChallenge_tokenHash_key" ON "TwoFactorLoginChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorLoginChallenge_userId_expiresAt_idx" ON "TwoFactorLoginChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "TwoFactorLoginChallenge_expiresAt_consumedAt_idx" ON "TwoFactorLoginChallenge"("expiresAt", "consumedAt");

-- AddForeignKey
ALTER TABLE "ReadingHistory" ADD CONSTRAINT "ReadingHistory_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorCredential" ADD CONSTRAINT "TwoFactorCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "TwoFactorCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorLoginChallenge" ADD CONSTRAINT "TwoFactorLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
