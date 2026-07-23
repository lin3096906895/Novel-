-- CreateEnum
CREATE TYPE "LoginActivityStatus" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "LoginRiskLevel" AS ENUM ('NORMAL', 'NOTICE', 'HIGH');

-- CreateTable
CREATE TABLE "LoginActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" "LoginActivityStatus" NOT NULL,
    "riskLevel" "LoginRiskLevel" NOT NULL DEFAULT 'NORMAL',
    "failureReason" TEXT,
    "sessionId" TEXT,
    "deviceName" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginActivity_userId_occurredAt_idx" ON "LoginActivity"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LoginActivity_email_occurredAt_idx" ON "LoginActivity"("email", "occurredAt");

-- CreateIndex
CREATE INDEX "LoginActivity_status_occurredAt_idx" ON "LoginActivity"("status", "occurredAt");

-- AddForeignKey
ALTER TABLE "LoginActivity" ADD CONSTRAINT "LoginActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
