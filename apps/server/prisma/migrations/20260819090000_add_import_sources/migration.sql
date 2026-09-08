-- Add source metadata for public-domain and licensed imports.
ALTER TABLE "Novel"
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "sourceName" TEXT,
ADD COLUMN "sourceExternalId" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceAuthor" TEXT,
ADD COLUMN "sourceLicense" TEXT;

ALTER TABLE "Chapter"
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "sourceName" TEXT,
ADD COLUMN "sourceExternalId" TEXT,
ADD COLUMN "sourceUrl" TEXT;

CREATE UNIQUE INDEX "Novel_sourceKey_key" ON "Novel"("sourceKey");
CREATE UNIQUE INDEX "Chapter_sourceKey_key" ON "Chapter"("sourceKey");
