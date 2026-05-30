"""
citations.py — Build and format citations from retrieved chunks
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Citation:
    document_id:   int
    document_name: str
    chunk_index:   int
    excerpt:       str          # first 200 chars of chunk
    page_number:   Optional[int] = None
    source_type:   str = "vector"   # vector | graph
    relevance:     float = 0.0      # 1 - distance (higher = more relevant)


def build_citation(
    chunk: dict,
    document_name: str,
    page_number: Optional[int] = None,
) -> Citation:
    """
    Build a Citation from a retrieved chunk dict.
    chunk = {document_id, chunk_index, content, distance, source_type}
    """
    content  = chunk.get("content", "")
    excerpt  = content[:220].strip()
    if len(content) > 220:
        # trim at last word boundary
        excerpt = excerpt.rsplit(" ", 1)[0] + "…"

    distance   = chunk.get("distance", 0.0) or 0.0
    relevance  = max(0.0, round(1.0 - float(distance), 3))

    return Citation(
        document_id=chunk.get("document_id", 0),
        document_name=document_name,
        chunk_index=chunk.get("chunk_index", 0),
        excerpt=excerpt,
        page_number=page_number,
        source_type=chunk.get("source_type", "vector"),
        relevance=relevance,
    )


def build_citations(
    sources: list[dict],
    doc_name_map: dict[int, str],        # {document_id: original_name}
    page_map: Optional[dict] = None,     # {document_id: page_number} optional
) -> list[dict]:
    """
    Build a list of citation dicts from sources list.
    Deduplicates by (document_id, chunk_index).
    Sorts by relevance descending.
    """
    seen    = set()
    results = []

    for chunk in sources:
        doc_id      = chunk.get("document_id")
        chunk_index = chunk.get("chunk_index", 0)
        key         = (doc_id, chunk_index)

        if key in seen:
            continue
        seen.add(key)

        doc_name = doc_name_map.get(doc_id, f"Document {doc_id}")
        page_num = (page_map or {}).get(doc_id)

        c = build_citation(chunk, doc_name, page_num)
        results.append({
            "document_id":   c.document_id,
            "document_name": c.document_name,
            "chunk_index":   c.chunk_index,
            "excerpt":       c.excerpt,
            "page_number":   c.page_number,
            "source_type":   c.source_type,
            "relevance":     c.relevance,
        })

    results.sort(key=lambda x: x["relevance"], reverse=True)
    return results[:5]   # top 5 citations max