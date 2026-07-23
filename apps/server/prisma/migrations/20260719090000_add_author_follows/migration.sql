-- CreateTable
CREATE TABLE "AuthorFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorFollow_followerId_authorId_key" ON "AuthorFollow"("followerId", "authorId");

-- CreateIndex
CREATE INDEX "AuthorFollow_authorId_createdAt_idx" ON "AuthorFollow"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthorFollow_followerId_createdAt_idx" ON "AuthorFollow"("followerId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthorFollow" ADD CONSTRAINT "AuthorFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorFollow" ADD CONSTRAINT "AuthorFollow_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
