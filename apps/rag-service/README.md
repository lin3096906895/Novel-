# Novel RAG Service

Python/FastAPI service for chapter chunking, embeddings and pgvector retrieval.

## Local Docker

From the repository root:

```powershell
corepack pnpm db:up
corepack pnpm --dir apps/server exec prisma migrate deploy
docker compose up -d rag
```

The service is bound to `127.0.0.1:8000` for local smoke tests. It is not intended to be called directly by the browser.

## Embeddings

The default Compose setting `EMBEDDING_MODE=local_hashing` provides a deterministic Chinese n-gram retrieval baseline. It is useful for local development but is not a neural semantic model. A `mock` mode is also available for pipeline smoke tests. For a real provider, configure an OpenAI-compatible embeddings endpoint:

```env
EMBEDDING_MODE=openai_compatible
EMBEDDING_BASE_URL=https://your-embedding-provider.example/v1
EMBEDDING_API_KEY=replace_me
EMBEDDING_MODEL=your-chinese-embedding-model
EMBEDDING_DIMENSIONS=1024
```

The embedding model dimension must match the PostgreSQL column `vector(1024)`. If the model changes dimension, create a new migration and re-index all chapters.

If the server cannot reach PyPI reliably, configure a trusted internal or regional package mirror during the image build. Do not commit credentials into the Dockerfile.

## Internal API

All write and retrieval endpoints require `Authorization: Bearer ${INTERNAL_RAG_TOKEN}`.

```text
POST /v1/index/chapter
POST /v1/retrieve
GET  /health
```

`/v1/index/chapter` compares the normalized chapter chunk hashes and embedding model before generating vectors. Unchanged chapters are skipped and reordered chapters only refresh their denormalized order metadata. `/v1/retrieve` defaults to published chapters; trusted author-side callers may send `includeUnpublished: true` for continuity checks on drafts.
