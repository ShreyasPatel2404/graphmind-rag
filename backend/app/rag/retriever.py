"""
retriever.py — Hybrid RAG: Vector (ChromaDB) + Graph (Neo4j)
Fixed: ChromaDB filter syntax + fallback when no doc filter
"""

import logging
from typing import Optional
from app.rag.ollama_client import embed_text
from app.rag.chroma_store import query_similar, get_collection
from app.rag.neo4j_client import run_read

logger = logging.getLogger(__name__)


# ─── Step 1: Vector retrieval ─────────────────────────────────────────────────
def vector_retrieve(
    query: str,
    user_id: int,
    project_id: Optional[int] = None,
    document_ids: Optional[list[int]] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Embed query → find top-k similar chunks in ChromaDB.
    """
    try:
        query_vec = embed_text(query)

        # Check how many items are in the collection first
        try:
            collection = get_collection(user_id, project_id)
            total = collection.count()
            logger.info(f"ChromaDB collection for user={user_id} project={project_id}: {total} items")
        except Exception as e:
            logger.warning(f"Could not check collection: {e}")
            total = 0

        if total == 0:
            # Try without project_id — user may have embedded without a project
            logger.info("Collection empty, trying without project_id...")
            try:
                collection_no_proj = get_collection(user_id, None)
                total_no_proj = collection_no_proj.count()
                logger.info(f"Collection without project: {total_no_proj} items")
                if total_no_proj > 0:
                    project_id = None  # fall back to user-level collection
            except Exception:
                pass

        results = query_similar(
            user_id=user_id,
            query_vector=query_vec,
            n_results=top_k,
            project_id=project_id,
            document_ids=document_ids,
        )
        logger.info(f"Vector retrieval returned {len(results)} chunks for query='{query[:50]}'")
        return results

    except Exception as e:
        logger.error(f"Vector retrieval failed: {e}", exc_info=True)
        return []


# ─── Step 2: Graph retrieval ──────────────────────────────────────────────────
def graph_retrieve(
    query: str,
    user_id: int,
    document_ids: Optional[list[int]] = None,
    max_results: int = 10,
) -> list[dict]:
    """
    Find entities in query → expand neighbors in Neo4j.
    """
    try:
        stop_words = {
            "what", "who", "where", "when", "how", "why", "is", "are",
            "was", "were", "the", "a", "an", "of", "in", "on", "at",
            "to", "for", "with", "about", "tell", "me", "explain",
            "describe", "give", "show", "list", "find", "does", "do",
            "did", "has", "have", "had", "can", "could", "would", "should",
            "across", "all", "main", "topics", "covered",
        }
        words = [
            w.strip("?.,!").lower()
            for w in query.split()
            if len(w) > 3 and w.lower() not in stop_words
        ]

        if not words:
            logger.info("No keywords extracted from query for graph search")
            return []

        conditions = " OR ".join(
            [f"toLower(n.name) CONTAINS '{w}'" for w in words[:5]]
        )

        doc_filter = ""
        if document_ids:
            ids_str = ", ".join(str(i) for i in document_ids)
            doc_filter = f"AND n.doc_id IN [{ids_str}]"

        query_cypher = f"""
            MATCH (n:Entity)
            WHERE ({conditions})
            AND n.user_id = {user_id}
            {doc_filter}
            WITH n LIMIT 5
            MATCH (n)-[r:RELATES]-(neighbor:Entity)
            RETURN
                n.name        AS subject,
                r.relation    AS relation,
                neighbor.name AS object,
                n.doc_id      AS doc_id
            LIMIT {max_results}
        """

        results = run_read(query_cypher)
        logger.info(f"Graph retrieval returned {len(results)} facts")
        return results

    except Exception as e:
        logger.error(f"Graph retrieval failed: {e}")
        return []


# ─── Step 3: Hybrid merge ─────────────────────────────────────────────────────
def hybrid_retrieve(
    query: str,
    user_id: int,
    project_id: Optional[int] = None,
    document_ids: Optional[list[int]] = None,
    top_k: int = 5,
) -> dict:
    """
    Run both retrievers and merge context.
    Auto-detects which ChromaDB collection has data.
    """
    logger.info(f"Hybrid retrieve: user={user_id} project={project_id} doc_ids={document_ids}")

    # ── Smart collection detection ────────────────────────────────────────
    # Documents embedded without a project go into the user-level collection.
    # Documents embedded WITH a project go into the project collection.
    # We need to check both and pick the right one.

    effective_project_id = project_id

    try:
        # Check project collection first
        if project_id:
            proj_collection = get_collection(user_id, project_id)
            proj_count = proj_collection.count()
            logger.info(f"Project collection (user={user_id}, proj={project_id}): {proj_count} items")

            if proj_count == 0:
                # Fall back to user-level collection
                user_collection = get_collection(user_id, None)
                user_count = user_collection.count()
                logger.info(f"User collection (no project): {user_count} items — using this instead")
                effective_project_id = None
    except Exception as e:
        logger.warning(f"Collection check failed: {e}")
        effective_project_id = None

    # ── Vector search ──────────────────────────────────────────────────────
    vector_results = vector_retrieve(
        query=query,
        user_id=user_id,
        project_id=effective_project_id,
        document_ids=document_ids,
        top_k=top_k,
    )

    # ── If still empty, try without any filters ────────────────────────────
    if not vector_results:
        logger.warning("Vector search empty — retrying without document_id filter")
        vector_results = vector_retrieve(
            query=query,
            user_id=user_id,
            project_id=None,
            document_ids=None,
            top_k=top_k,
        )

    # ── Graph search ───────────────────────────────────────────────────────
    graph_results = graph_retrieve(
        query=query,
        user_id=user_id,
        document_ids=document_ids,
    )

    # ── Build context string ───────────────────────────────────────────────
    context_parts = []

    if vector_results:
        context_parts.append("=== Relevant Document Excerpts ===")
        for i, chunk in enumerate(vector_results):
            context_parts.append(f"[Excerpt {i+1}]: {chunk['content']}")
    else:
        logger.warning("No vector results found — LLM will answer without context")

    if graph_results:
        context_parts.append("\n=== Knowledge Graph Facts ===")
        for fact in graph_results:
            subj = fact.get("subject", "")
            rel  = fact.get("relation", "")
            obj  = fact.get("object", "")
            if subj and rel and obj:
                context_parts.append(f"• {subj} → {rel} → {obj}")

    context = "\n\n".join(context_parts)
    logger.info(f"Context built: {len(context)} chars, {len(vector_results)} chunks, {len(graph_results)} graph facts")

    sources = [
        {
            "document_id": r["document_id"],
            "chunk_index": r.get("chunk_index", 0),
            "content":     r["content"],
            "distance":    r.get("distance", 0),
            "source_type": "vector",
        }
        for r in vector_results
    ]

    return {
        "vector_chunks": vector_results,
        "graph_facts":   graph_results,
        "context":       context,
        "sources":       sources,
    }