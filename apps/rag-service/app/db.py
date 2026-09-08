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
    top_k: int,
    max_chapter_order: int | None,
) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                '''
                SELECT nc."chapterId", nc."chapterOrder", nc."chunkIndex", nc."content", nc."metadata",
                       1 - (nc."embedding" <=> %s::vector) AS score
                FROM "NovelChunk" AS nc
                INNER JOIN "Chapter" AS c ON c."id" = nc."chapterId"
                WHERE nc."novelId" = %s
                  AND c."deletedAt" IS NULL
                  AND nc."embedding" IS NOT NULL
                  AND (%s::integer IS NULL OR nc."chapterOrder" <= %s)
                ORDER BY nc."embedding" <=> %s::vector
                LIMIT %s
                ''',
                (embedding, novel_id, max_chapter_order, max_chapter_order, embedding, top_k),
            )
            rows = cursor.fetchall()
    return [
        {
            "chapterId": row[0],
            "chapterOrder": row[1],
            "chunkIndex": row[2],
            "content": row[3],
            "metadata": row[4],
            "score": float(row[5]),
        }
        for row in rows
    ]
