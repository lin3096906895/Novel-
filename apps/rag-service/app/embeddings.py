import hashlib
import math

import httpx

from .settings import settings


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if settings.embedding_mode == "mock":
        return [mock_embedding(text) for text in texts]

    if settings.embedding_mode != "openai_compatible":
        raise RuntimeError(f"Unsupported EMBEDDING_MODE: {settings.embedding_mode}")
    if not settings.embedding_base_url or not settings.embedding_api_key or not settings.embedding_model:
        raise RuntimeError("EMBEDDING_BASE_URL, EMBEDDING_API_KEY and EMBEDDING_MODEL are required")

    endpoint = f"{settings.embedding_base_url.rstrip('/')}/embeddings"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {settings.embedding_api_key}",
                "Content-Type": "application/json",
            },
            json={"model": settings.embedding_model, "input": texts},
        )
        response.raise_for_status()
        payload = response.json()
        vectors = [item["embedding"] for item in sorted(payload["data"], key=lambda item: item["index"])]
        if any(len(vector) != settings.embedding_dimensions for vector in vectors):
            raise RuntimeError("Embedding dimensions do not match EMBEDDING_DIMENSIONS")
        return vectors


def mock_embedding(text: str) -> list[float]:
    """Deterministic local embedding for Docker smoke tests, not production retrieval."""
    dimensions = settings.embedding_dimensions
    values = [0.0] * dimensions
    digest = hashlib.sha512(text.encode("utf-8")).digest()
    for index, byte in enumerate(digest):
        values[(byte + index * 31) % dimensions] += (byte / 255.0) + 0.01
    norm = math.sqrt(sum(value * value for value in values)) or 1.0
    return [value / norm for value in values]
