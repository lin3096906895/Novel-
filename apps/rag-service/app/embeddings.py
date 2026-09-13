import hashlib
import math
import re
from collections import Counter

import httpx

from .settings import settings


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if settings.embedding_mode == "mock":
        return [mock_embedding(text) for text in texts]

    if settings.embedding_mode == "local_hashing":
        return [local_hashing_embedding(text) for text in texts]

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


def local_hashing_embedding(text: str) -> list[float]:
    """Dependency-free Chinese-friendly feature hashing for local retrieval baselines.

    This is intentionally not presented as a neural semantic model. It preserves
    overlapping Chinese character n-grams, names and terminology so the complete
    indexing/retrieval/evaluation path can run locally before a production
    embedding provider is configured.
    """
    dimensions = settings.embedding_dimensions
    normalized = re.sub(r"\s+", "", text.lower())
    if not normalized:
        return [0.0] * dimensions

    features: Counter[str] = Counter()
    for size, weight in ((1, 0.25), (2, 1.0), (3, 0.8), (4, 0.45)):
        if len(normalized) < size:
            continue
        for index in range(len(normalized) - size + 1):
            feature = normalized[index : index + size]
            if re.fullmatch(r"[\W_]+", feature, flags=re.UNICODE):
                continue
            features[feature] += weight

    values = [0.0] * dimensions
    for feature, frequency in features.items():
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] & 1 else -1.0
        values[bucket] += sign * (1.0 + math.log1p(frequency))

    norm = math.sqrt(sum(value * value for value in values)) or 1.0
    return [value / norm for value in values]
