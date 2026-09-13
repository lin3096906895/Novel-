from time import perf_counter
from typing import Annotated
import re
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from .chunking import split_chapter
from .db import (
    clear_chapter_chunks,
    get_novel_index_status,
    is_chapter_index_current,
    load_novel_chapters,
    replace_chapter_chunks,
    retrieve_chunks,
    update_chapter_chunk_order,
)
from .embeddings import embed_texts
from .settings import settings

app = FastAPI(title="Novel RAG Service", version="0.1.0")


class IndexChapterRequest(BaseModel):
    novelId: str = Field(min_length=1)
    chapterId: str = Field(min_length=1)
    chapterOrder: int = Field(ge=0)
    title: str = Field(default="", max_length=200)
    content: str = Field(min_length=1)


class RetrieveRequest(BaseModel):
    novelId: str = Field(min_length=1)
    query: str = Field(min_length=1, max_length=4000)
    topK: int = Field(default=8, ge=1, le=30)
    maxChapterOrder: int | None = Field(default=None, ge=0)
    includeUnpublished: bool = False


class IndexNovelRequest(BaseModel):
    novelId: str = Field(min_length=1)
    maxChapterOrder: int | None = Field(default=None, ge=1)


def verify_internal_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = settings.internal_rag_token.strip()
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid RAG service token")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "service": "novel-rag",
        "status": "healthy",
        "embeddingMode": settings.embedding_mode,
        "embeddingModel": settings.embedding_model,
        "embeddingDimensions": settings.embedding_dimensions,
    }


@app.post("/v1/index/chapter", dependencies=[Depends(verify_internal_token)])
async def index_chapter(payload: IndexChapterRequest) -> dict[str, object]:
    chunks = split_chapter(payload.content)
    if not chunks:
        try:
            deleted = clear_chapter_chunks(chapter_id=payload.chapterId)
        except Exception as error:
            raise HTTPException(status_code=502, detail=f"RAG indexing failed: {error}") from error
        return {
            "indexed": 0,
            "cleared": deleted > 0,
            "changed": deleted > 0,
            "embeddingModel": settings.embedding_model,
        }
    try:
        if is_chapter_index_current(chapter_id=payload.chapterId, title=payload.title, chunks=chunks):
            update_chapter_chunk_order(
                chapter_id=payload.chapterId,
                chapter_order=payload.chapterOrder,
            )
            return {
                "indexed": len(chunks),
                "skipped": True,
                "changed": False,
                "embeddingModel": settings.embedding_model,
            }
        vectors = await embed_texts([chunk.content for chunk in chunks])
        rows = [
            {
                "id": str(uuid4()),
                "index": chunk.index,
                "content": chunk.content,
                "content_hash": chunk.content_hash,
                "token_count": chunk.token_count,
                "start_offset": chunk.start_offset,
                "end_offset": chunk.end_offset,
                "embedding": vector,
                "metadata": {"title": payload.title},
            }
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        count = replace_chapter_chunks(
            novel_id=payload.novelId,
            chapter_id=payload.chapterId,
            chapter_order=payload.chapterOrder,
            chunks=rows,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"RAG indexing failed: {error}") from error
    return {
        "indexed": count,
        "skipped": False,
        "changed": True,
        "embeddingModel": settings.embedding_model,
    }


@app.post("/v1/retrieve", dependencies=[Depends(verify_internal_token)])
async def retrieve(payload: RetrieveRequest) -> dict[str, object]:
    try:
        [embedding] = await embed_texts([payload.query])
        items = retrieve_chunks(
            novel_id=payload.novelId,
            embedding=embedding,
            query=payload.query,
            query_terms=extract_query_terms(payload.query),
            top_k=payload.topK,
            max_chapter_order=payload.maxChapterOrder,
            include_unpublished=payload.includeUnpublished,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"RAG retrieval failed: {error}") from error
    return {"items": items}


@app.post("/v1/index/novel", dependencies=[Depends(verify_internal_token)])
async def index_novel(payload: IndexNovelRequest) -> dict[str, object]:
    started_at = perf_counter()
    chapters = load_novel_chapters(payload.novelId, payload.maxChapterOrder)
    if not chapters:
        raise HTTPException(status_code=404, detail="Novel has no indexable chapters")

    indexed_chunks = 0
    changed_chapters = 0
    skipped_chapters = 0
    cleared_chapters = 0
    for chapter in chapters:
        chunks = split_chapter(chapter["content"])
        if not chunks:
            if clear_chapter_chunks(chapter_id=chapter["id"]) > 0:
                cleared_chapters += 1
            continue
        if is_chapter_index_current(chapter_id=chapter["id"], title=chapter["title"], chunks=chunks):
            update_chapter_chunk_order(
                chapter_id=chapter["id"],
                chapter_order=chapter["orderIndex"],
            )
            skipped_chapters += 1
            continue
        vectors = await embed_texts([chunk.content for chunk in chunks])
        rows = [
            {
                "id": str(uuid4()),
                "index": chunk.index,
                "content": chunk.content,
                "content_hash": chunk.content_hash,
                "token_count": chunk.token_count,
                "start_offset": chunk.start_offset,
                "end_offset": chunk.end_offset,
                "embedding": vector,
                "metadata": {
                    "title": chapter["title"],
                    "wordCount": chapter["wordCount"],
                },
            }
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        indexed_chunks += replace_chapter_chunks(
            novel_id=payload.novelId,
            chapter_id=chapter["id"],
            chapter_order=chapter["orderIndex"],
            chunks=rows,
        )
        changed_chapters += 1

    return {
        "novelId": payload.novelId,
        "indexedChapters": len(chapters),
        "indexedChunks": indexed_chunks,
        "changedChapters": changed_chapters,
        "skippedChapters": skipped_chapters,
        "clearedChapters": cleared_chapters,
        "durationMs": round((perf_counter() - started_at) * 1000),
        "embeddingMode": settings.embedding_mode,
        "embeddingModel": settings.embedding_model,
    }


@app.get("/v1/index/novel/{novel_id}", dependencies=[Depends(verify_internal_token)])
def novel_index_status(novel_id: str) -> dict[str, object]:
    return get_novel_index_status(novel_id)


def extract_query_terms(query: str, limit: int = 16) -> list[str]:
    candidates: dict[str, float] = {}
    quoted = re.findall(r"[“\"'「『]([^”\"'」』]{2,16})[”\"'」』]", query)
    for term in quoted:
        candidates[term.strip()] = candidates.get(term.strip(), 0) + 8.0

    runs = re.findall(r"[\u3400-\u9fff]{2,}|[a-zA-Z][a-zA-Z0-9_-]{1,30}", query.lower())
    stop_terms = {"一个", "这个", "那个", "他们", "我们", "自己", "没有", "什么", "已经", "可以", "因为", "所以", "但是", "然后"}
    for run in runs:
        if len(run) <= 8 and run not in stop_terms:
            candidates[run] = candidates.get(run, 0) + len(run)
        if re.fullmatch(r"[\u3400-\u9fff]+", run):
            for size, weight in ((2, 1.0), (3, 1.8), (4, 2.2)):
                for index in range(max(len(run) - size + 1, 0)):
                    term = run[index : index + size]
                    if term in stop_terms:
                        continue
                    candidates[term] = candidates.get(term, 0) + weight

    return [
        term
        for term, _ in sorted(candidates.items(), key=lambda item: (-item[1], -len(item[0]), item[0]))[:limit]
    ]
