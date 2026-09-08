from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from .chunking import split_chapter
from .db import replace_chapter_chunks, retrieve_chunks
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
        raise HTTPException(status_code=400, detail="Chapter content is empty after normalization")
    try:
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
    return {"indexed": count, "embeddingModel": settings.embedding_model}


@app.post("/v1/retrieve", dependencies=[Depends(verify_internal_token)])
async def retrieve(payload: RetrieveRequest) -> dict[str, object]:
    try:
        [embedding] = await embed_texts([payload.query])
        items = retrieve_chunks(
            novel_id=payload.novelId,
            embedding=embedding,
            top_k=payload.topK,
            max_chapter_order=payload.maxChapterOrder,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"RAG retrieval failed: {error}") from error
    return {"items": items}
