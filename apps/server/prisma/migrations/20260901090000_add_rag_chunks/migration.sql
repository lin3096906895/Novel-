-- RAG storage for chapter chunks and embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "NovelChunk" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "startOffset" INTEGER NOT NULL DEFAULT 0,
    "endOffset" INTEGER NOT NULL DEFAULT 0,
    "embeddingModel" TEXT NOT NULL,
    "embedding" vector(1024),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NovelChunk_chapterId_chunkIndex_key"
ON "NovelChunk"("chapterId", "chunkIndex");

CREATE INDEX "NovelChunk_novelId_chapterOrder_idx"
ON "NovelChunk"("novelId", "chapterOrder");

CREATE INDEX "NovelChunk_chapterId_chunkIndex_idx"
ON "NovelChunk"("chapterId", "chunkIndex");

CREATE INDEX "NovelChunk_contentHash_idx"
ON "NovelChunk"("contentHash");

CREATE INDEX "NovelChunk_embedding_hnsw_idx"
ON "NovelChunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "NovelChunk"
ADD CONSTRAINT "NovelChunk_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovelChunk"
ADD CONSTRAINT "NovelChunk_chapterId_fkey"
FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
