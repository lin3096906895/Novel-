-- Chinese-friendly lexical retrieval for the RAG hybrid ranking path.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "NovelChunk_content_trgm_idx"
ON "NovelChunk" USING gin (LOWER("content") gin_trgm_ops);
