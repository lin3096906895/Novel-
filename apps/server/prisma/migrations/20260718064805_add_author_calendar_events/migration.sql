-- CreateEnum
CREATE TYPE "AuthorCalendarEventType" AS ENUM ('WRITING', 'REVISION', 'REMINDER');

-- CreateTable
CREATE TABLE "AuthorCalendarEvent" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "type" "AuthorCalendarEventType" NOT NULL DEFAULT 'WRITING',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthorCalendarEvent_novelId_eventAt_idx" ON "AuthorCalendarEvent"("novelId", "eventAt");

-- CreateIndex
CREATE INDEX "AuthorCalendarEvent_eventAt_isCompleted_idx" ON "AuthorCalendarEvent"("eventAt", "isCompleted");

-- AddForeignKey
ALTER TABLE "AuthorCalendarEvent" ADD CONSTRAINT "AuthorCalendarEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
