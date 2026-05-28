"""
chunker.py — Split extracted text into overlapping chunks for RAG
Default: 500 tokens (~2000 chars) per chunk, 50-token overlap (~200 chars)
"""

from typing import List


# ─── Simple character-based splitter (no extra deps needed) ───────────────────
def split_text(
    text: str,
    chunk_size: int = 2000,      # ~500 tokens  (1 token ≈ 4 chars)
    overlap: int = 200,          # ~50  tokens
    min_chunk_len: int = 50,
) -> List[dict]:
    """
    Split text into overlapping chunks.

    Returns list of dicts:
        [{"chunk_index": int, "content": str, "char_start": int, "char_end": int}]
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    chunks = []
    start = 0
    idx = 0

    while start < len(text):
        end = start + chunk_size

        # Try to break at a sentence boundary (. ! ?) within last 200 chars
        if end < len(text):
            # Search backwards from `end` for a sentence-ending punctuation
            break_pos = _find_break(text, end, lookback=200)
            end = break_pos if break_pos else end

        chunk_text = text[start:end].strip()

        if len(chunk_text) >= min_chunk_len:
            chunks.append({
                "chunk_index": idx,
                "content":     chunk_text,
                "char_start":  start,
                "char_end":    end,
            })
            idx += 1

        # Move start forward, subtract overlap so chunks share context
        start = end - overlap
        if start >= len(text):
            break

    return chunks


def _find_break(text: str, pos: int, lookback: int = 200) -> int | None:
    """Find the last sentence-ending punctuation before `pos`."""
    search_from = max(0, pos - lookback)
    segment = text[search_from:pos]

    # Search backwards for . ! ? followed by whitespace
    for i in range(len(segment) - 1, -1, -1):
        if segment[i] in ".!?" and (i + 1 >= len(segment) or segment[i + 1] in " \n\t"):
            return search_from + i + 1

    # Fallback: find last newline
    nl = segment.rfind("\n")
    if nl != -1:
        return search_from + nl + 1

    return None  # No good break found — caller uses raw end