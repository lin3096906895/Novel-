from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb

from .settings import settings


@contextmanager
def connection() -> Iterator[psycopg.Connection[Any]]:
    with psycopg.connect(settings.database_url) as conn:
        register_vector(conn)
        yield conn


def replace_chapter_chunks(
    *,
    novel_id: str,
    chapter_id: str,
    chapter_order: int,
    chunks: list[dict[str, Any]],
) -> int:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM "NovelChunk" WHERE "chapterId" = %s', (chapter_id,))
            for chunk in chunks:
                cursor.execute(
                    '''
                    INSERT INTO "NovelChunk"
                      ("id", "novelId", "chapterId", "chapterOrder", "chunkIndex",
                       "content", "contentHash", "tokenCount", "startOffset", "endOffset",
                       "embeddingModel", "embedding", "metadata", "createdAt", "updatedAt")
                    VALUES
                      (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb,
                       NOW(), NOW())
                    ''',
                    (
                        chunk["id"],
                        novel_id,
                        chapter_id,
                        chapter_order,
                        chunk["index"],
                        chunk["content"],
                        chunk["content_hash"],
                        chunk["token_count"],
                        chunk["start_offset"],
                        chunk["end_offset"],
                        settings.embedding_model,
                        chunk["embedding"],
                        Jsonb(chunk["metadata"]),
                    ),
                )
        conn.commit()
    return len(chunks)


def retrieve_chunks(
    *,
    novel_id: str,
    embedding: list[float],
    query: str,
    query_terms: list[str],
    top_k: int,
    max_chapter_order: int | None,
) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                '''
                WITH scored AS (
                  SELECT nc."chapterId", nc."chapterOrder", nc."chunkIndex", nc."content", nc."metadata",
                         1 - (nc."embedding" <=> %s::vector) AS vector_score,
                         GREATEST(
                           similarity(LOWER(nc."content"), LOWER(%s)),
                           COALESCE((
                             SELECT
                               MAX(word_similarity(LOWER(term), LOWER(nc."content"))) * 0.4
                               + AVG(
                                   CASE
                                     WHEN POSITION(LOWER(term) IN LOWER(nc."content")) > 0 THEN 1.0
                                     ELSE 0.0
                                   END
                                 ) * 0.6
                             FROM unnest(%s::text[]) AS term
                           ), 0)
                         ) AS lexical_score
                  FROM "NovelChunk" AS nc
                  INNER JOIN "Chapter" AS c ON c."id" = nc."chapterId"
                  WHERE nc."novelId" = %s
                    AND c."deletedAt" IS NULL
                    AND nc."embedding" IS NOT NULL
                    AND nc."embeddingModel" = %s
                    AND (%s::integer IS NULL OR nc."chapterOrder" <= %s)
                )
                SELECT "chapterId", "chapterOrder", "chunkIndex", "content", "metadata",
                       vector_score, lexical_score,
                       vector_score * 0.65 + lexical_score * 0.35 AS score
                FROM scored
                ORDER BY score DESC, "chapterOrder" DESC
                LIMIT %s
                ''',
                (
                    embedding,
                    query,
                    query_terms,
                    novel_id,
                    settings.embedding_model,
                    max_chapter_order,
                    max_chapter_order,
                    top_k,
                ),
            )
            rows = cursor.fetchall()
    return [
        {
            "chapterId": row[0],
            "chapterOrder": row[1],
            "chunkIndex": row[2],
            "content": row[3],
            "metadata": row[4],
            "vectorScore": float(row[5]),
            "lexicalScore": float(row[6]),
            "score": float(row[7]),
        }
        for row in rows
    ]


def load_novel_chapters(novel_id: str, max_chapter_order: int | None) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                '''
                SELECT "id", "orderIndex", "title", "content", "wordCount"
                FROM "Chapter"
                WHERE "novelId" = %s
                  AND "deletedAt" IS NULL
                  AND (%s::integer IS NULL OR "orderIndex" <= %s)
                ORDER BY "orderIndex" ASC
                ''',
                (novel_id, max_chapter_order, max_chapter_order),
            )
            rows = cursor.fetchall()
    return [
        {
            "id": row[0],
            "orderIndex": row[1],
            "title": row[2],
            "content": row[3],
            "wordCount": row[4],
        }
        for row in rows
    ]


def get_novel_index_status(novel_id: str) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                '''
                SELECT
                  (SELECT COUNT(*) FROM "Chapter" c
                   WHERE c."novelId" = %s AND c."deletedAt" IS NULL) AS chapter_count,
                  COUNT(DISTINCT nc."chapterId") FILTER (
                    WHERE nc."embeddingModel" = %s
                  ) AS indexed_chapter_count,
                  COUNT(*) FILTER (
                    WHERE nc."embeddingModel" = %s
                  ) AS chunk_count,
                  COALESCE(SUM(nc."tokenCount") FILTER (
                    WHERE nc."embeddingModel" = %s
                  ), 0) AS indexed_character_count,
                  MAX(nc."updatedAt") FILTER (
                    WHERE nc."embeddingModel" = %s
                  ) AS last_indexed_at
                FROM "NovelChunk" nc
                WHERE nc."novelId" = %s
                ''',
                (
                    novel_id,
                    settings.embedding_model,
                    settings.embedding_model,
                    settings.embedding_model,
                    settings.embedding_model,
                    novel_id,
                ),
            )
            row = cursor.fetchone()

    chapter_count = int(row[0] if row else 0)
    indexed_chapter_count = int(row[1] if row else 0)
    return {
        "novelId": novel_id,
        "chapterCount": chapter_count,
        "indexedChapterCount": indexed_chapter_count,
        "pendingChapterCount": max(chapter_count - indexed_chapter_count, 0),
        "chunkCount": int(row[2] if row else 0),
        "indexedCharacterCount": int(row[3] if row else 0),
        "lastIndexedAt": row[4].isoformat() if row and row[4] else None,
        "embeddingMode": settings.embedding_mode,
        "embeddingModel": settings.embedding_model,
    }
