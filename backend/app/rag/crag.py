"""
crag.py — Corrective RAG (CRAG) pattern
Step 1: Grade relevance of each retrieved chunk (0.0 - 1.0)
Step 2: If avg relevance < threshold, rewrite query and re-retrieve
Step 3: Return best context + confidence score
"""

import logging
import re
from typing import Optional
from app.rag.ollama_client import generate

logger = logging.getLogger(__name__)

RELEVANCE_THRESHOLD = 0.45   # below this → trigger corrective retrieval
HIGH_CONFIDENCE     = 0.70   # above this → "High" badge
MEDIUM_CONFIDENCE   = 0.45   # above this → "Medium" badge


# ─── Grade a single chunk's relevance to the query ────────────────────────────
def grade_relevance(query: str, chunk: str) -> float:
    """
    Ask Ollama to score how relevant a chunk is to a query.
    Returns float 0.0 – 1.0
    """
    prompt = f"""Rate how relevant the following text excerpt is to answering the question.
Respond with ONLY a decimal number between 0.0 and 1.0.
- 1.0 = directly answers the question
- 0.5 = partially relevant
- 0.0 = completely irrelevant

Question: {query}

Excerpt: {chunk[:500]}

Relevance score (0.0-1.0):"""

    try:
        raw = generate(prompt).strip()
        # Extract first number from response
        match = re.search(r"(\d+\.?\d*)", raw)
        if match:
            score = float(match.group(1))
            return min(1.0, max(0.0, score))
        return 0.5  # default if parsing fails
    except Exception as e:
        logger.warning(f"Relevance grading failed: {e}")
        return 0.5


def grade_chunks(query: str, chunks: list[dict], max_grade: int = 5) -> list[dict]:
    """
    Grade up to max_grade chunks for relevance.
    Returns chunks with added 'relevance_score' field.
    """
    graded = []
    for i, chunk in enumerate(chunks):
        if i < max_grade:
            score = grade_relevance(query, chunk.get("content", ""))
        else:
            score = 0.5   # don't grade all — too slow
        graded.append({**chunk, "relevance_score": score})

    graded.sort(key=lambda x: x["relevance_score"], reverse=True)
    return graded


# ─── Query rewriting ──────────────────────────────────────────────────────────
def rewrite_query(original_query: str, context_hint: str = "") -> str:
    """
    Rewrite a query to be more specific and retrieval-friendly.
    """
    prompt = f"""Rewrite the following question to be more specific and detailed for document search.
Keep the same intent but make it more precise. Return ONLY the rewritten question, nothing else.

Original question: {original_query}
{f'Context hint: {context_hint}' if context_hint else ''}

Rewritten question:"""

    try:
        rewritten = generate(prompt).strip()
        # Clean up common prefixes
        for prefix in ["Rewritten question:", "Question:", "Here is", "Here's"]:
            if rewritten.lower().startswith(prefix.lower()):
                rewritten = rewritten[len(prefix):].strip()
        rewritten = rewritten.strip('"\'')
        return rewritten if len(rewritten) > 10 else original_query
    except Exception as e:
        logger.warning(f"Query rewrite failed: {e}")
        return original_query


# ─── Confidence calculation ────────────────────────────────────────────────────
def calculate_confidence(graded_chunks: list[dict], graph_facts: list[dict]) -> dict:
    """
    Calculate overall answer confidence from chunk scores + graph presence.
    Returns {score: float, label: str, reason: str}
    """
    if not graded_chunks:
        return {"score": 0.0, "label": "Low", "reason": "No relevant chunks found"}

    scores = [c.get("relevance_score", 0.5) for c in graded_chunks[:5]]
    avg_score = sum(scores) / len(scores)

    # Boost if graph facts corroborate
    if graph_facts:
        avg_score = min(1.0, avg_score + 0.10)

    if avg_score >= HIGH_CONFIDENCE:
        label  = "High"
        reason = f"Strong match across {len(graded_chunks)} chunks"
    elif avg_score >= MEDIUM_CONFIDENCE:
        label  = "Medium"
        reason = f"Partial match — answer may be incomplete"
    else:
        label  = "Low"
        reason = f"Weak relevance — consider rephrasing your question"

    return {
        "score": round(avg_score, 3),
        "label": label,
        "reason": reason,
    }


# ─── Full CRAG pipeline ────────────────────────────────────────────────────────
def corrective_retrieve(
    query: str,
    user_id: int,
    initial_chunks: list[dict],
    graph_facts: list[dict],
    project_id: Optional[int] = None,
    document_ids: Optional[list[int]] = None,
) -> dict:
    """
    Main CRAG entry point.
    1. Grade initial chunks
    2. If low relevance → rewrite query → re-retrieve
    3. Return best context + confidence
    """
    # Import here to avoid circular imports
    from app.rag.retriever import vector_retrieve

    # Step 1: Grade initial chunks
    logger.info(f"CRAG: grading {len(initial_chunks)} chunks")
    graded = grade_chunks(query, initial_chunks, max_grade=3)

    avg_relevance = (
        sum(c.get("relevance_score", 0.5) for c in graded) / len(graded)
        if graded else 0.0
    )
    logger.info(f"CRAG: avg relevance = {avg_relevance:.2f}")

    final_chunks = graded
    used_rewrite = False
    rewritten_query = query

    # Step 2: If relevance is low, rewrite and re-retrieve
    if avg_relevance < RELEVANCE_THRESHOLD and initial_chunks:
        logger.info("CRAG: low relevance — rewriting query")
        rewritten_query = rewrite_query(query)
        logger.info(f"CRAG: rewritten query = '{rewritten_query}'")

        new_chunks = vector_retrieve(
            query=rewritten_query,
            user_id=user_id,
            project_id=project_id,
            document_ids=document_ids,
            top_k=5,
        )

        if new_chunks:
            new_graded = grade_chunks(rewritten_query, new_chunks, max_grade=3)
            new_avg = (
                sum(c.get("relevance_score", 0.5) for c in new_graded) / len(new_graded)
                if new_graded else 0.0
            )
            # Use rewritten results if they're better
            if new_avg > avg_relevance:
                logger.info(f"CRAG: rewrite improved relevance {avg_relevance:.2f} → {new_avg:.2f}")
                final_chunks = new_graded
                avg_relevance = new_avg
                used_rewrite = True

    # Step 3: Build final context
    context_parts = []
    if final_chunks:
        context_parts.append("=== Relevant Document Excerpts ===")
        for i, chunk in enumerate(final_chunks[:5]):
            context_parts.append(f"[Excerpt {i+1}]: {chunk['content']}")

    if graph_facts:
        context_parts.append("\n=== Knowledge Graph Facts ===")
        for fact in graph_facts[:10]:
            subj = fact.get("subject", "")
            rel  = fact.get("relation", "")
            obj  = fact.get("object", "")
            if subj and rel and obj:
                context_parts.append(f"• {subj} → {rel} → {obj}")

    context = "\n\n".join(context_parts)

    # Step 4: Confidence score
    confidence = calculate_confidence(final_chunks, graph_facts)

    return {
        "context":          context,
        "chunks":           final_chunks,
        "confidence":       confidence,
        "used_rewrite":     used_rewrite,
        "rewritten_query":  rewritten_query if used_rewrite else None,
        "avg_relevance":    avg_relevance,
    }