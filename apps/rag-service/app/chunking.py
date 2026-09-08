from dataclasses import dataclass
import hashlib
import re


@dataclass(frozen=True)
class TextChunk:
    index: int
    content: str
    content_hash: str
    start_offset: int
    end_offset: int
    token_count: int


def split_chapter(text: str, max_chars: int = 900, overlap_chars: int = 120) -> list[TextChunk]:
    normalized = re.sub(r"\r\n?", "\n", text).strip()
    if not normalized:
        return []

    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", normalized) if paragraph.strip()]
    chunks: list[TextChunk] = []
    buffer = ""
    buffer_start = 0
    cursor = 0

    for paragraph in paragraphs:
        paragraph_start = normalized.find(paragraph, cursor)
        paragraph_end = paragraph_start + len(paragraph)
        cursor = paragraph_end
        candidate = paragraph if not buffer else f"{buffer}\n\n{paragraph}"
        if buffer and len(candidate) > max_chars:
            chunks.append(make_chunk(len(chunks), buffer, buffer_start, buffer_start + len(buffer)))
            overlap = buffer[-overlap_chars:] if overlap_chars > 0 else ""
            buffer = f"{overlap}\n\n{paragraph}" if overlap else paragraph
            buffer_start = max(paragraph_start - len(overlap), 0)
        else:
            if not buffer:
                buffer_start = paragraph_start
            buffer = candidate

        if len(paragraph) > max_chars:
            while len(buffer) > max_chars:
                current = buffer[:max_chars]
                chunks.append(make_chunk(len(chunks), current, buffer_start, buffer_start + len(current)))
                overlap = current[-overlap_chars:] if overlap_chars > 0 else ""
                buffer = f"{overlap}{buffer[max_chars:]}"
                buffer_start += max_chars - len(overlap)

    if buffer:
        chunks.append(make_chunk(len(chunks), buffer, buffer_start, buffer_start + len(buffer)))
    return chunks


def make_chunk(index: int, content: str, start_offset: int, end_offset: int) -> TextChunk:
    compact = content.strip()
    return TextChunk(
        index=index,
        content=compact,
        content_hash=hashlib.sha256(compact.encode("utf-8")).hexdigest(),
        start_offset=start_offset,
        end_offset=end_offset,
        token_count=len(re.sub(r"\s+", "", compact)),
    )
