"""
chroma_store.py — ChromaDB wrapper
Fixed: document_ids filter uses correct ChromaDB $in syntax
"""

import logging
from typing import List, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from pathlib import Path

logger = logging.getLogger(__name__)

CHROMA_DIR = Path("chroma_db")
CHROMA_DIR.mkdir(exist_ok=True)

_client: Optional[chromadb.PersistentClient] = None


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_collection(user_id: int, project_id: Optional[int] = None):
    """Get or create a ChromaDB collection for this user/project."""
    client = get_client()
    name = f"user_{user_id}" if not project_id else f"user_{user_id}_proj_{project_id}"
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


def list_all_collections() -> list[str]:
    """List all collection names — useful for debugging."""
    try:
        client = get_client()
        return [c.name for c in client.list_collections()]
    except Exception as e:
        logger.error(f"Failed to list collections: {e}")
        return []


def store_chunks(
    user_id: int,
    document_id: int,
    chunks: List[str],
    vectors: List[List[float]],
    project_id: Optional[int] = None,
    metadatas: Optional[List[dict]] = None,
):
    """Upsert chunk embeddings into ChromaDB."""
    collection = get_collection(user_id, project_id)

    ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(chunks))]

    base_meta = {
        "document_id": document_id,
        "user_id":     user_id,
    }
    if metadatas:
        metas = [{**base_meta, **m} for m in metadatas]
    else:
        metas = [base_meta.copy() for _ in chunks]

    # Upsert in batches of 100
    batch = 100
    for start in range(0, len(chunks), batch):
        end = start + batch
        collection.upsert(
            ids=ids[start:end],
            embeddings=vectors[start:end],
            documents=chunks[start:end],
            metadatas=metas[start:end],
        )

    logger.info(
        f"Stored {len(chunks)} chunks for doc {document_id} "
        f"in collection user={user_id} project={project_id}"
    )


def query_similar(
    user_id: int,
    query_vector: List[float],
    n_results: int = 5,
    project_id: Optional[int] = None,
    document_ids: Optional[List[int]] = None,
) -> List[dict]:
    """
    Find most similar chunks to query_vector.
    Returns list of {content, document_id, distance, chunk_index}
    """
    try:
        collection = get_collection(user_id, project_id)
        total = collection.count()

        if total == 0:
            logger.warning(
                f"Collection user={user_id} project={project_id} is empty. "
                f"Available collections: {list_all_collections()}"
            )
            return []

        # ── Build where filter ──────────────────────────────────────────
        # ChromaDB requires integer values in metadata for $in operator.
        # document_id is stored as int — use $in only when filtering.
        where = None
        if document_ids and len(document_ids) > 0:
            if len(document_ids) == 1:
                # Single doc — use $eq (simpler, more reliable)
                where = {"document_id": {"$eq": document_ids[0]}}
            else:
                # Multiple docs — use $in
                where = {"document_id": {"$in": document_ids}}

        safe_n = min(n_results, total)
        logger.info(
            f"ChromaDB query: collection=user_{user_id}_proj{project_id}, "
            f"total={total}, n={safe_n}, where={where}"
        )

        results = collection.query(
            query_embeddings=[query_vector],
            n_results=safe_n,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        output = []
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i]
            output.append({
                "content":     doc,
                "document_id": meta.get("document_id"),
                "distance":    results["distances"][0][i],
                "chunk_index": meta.get("chunk_index", i),
            })

        logger.info(f"ChromaDB returned {len(output)} results")
        return output

    except Exception as e:
        logger.error(f"ChromaDB query error: {e}", exc_info=True)
        return []


def delete_document_chunks(
    user_id: int,
    document_id: int,
    project_id: Optional[int] = None,
):
    """Remove all chunks for a document from ChromaDB."""
    try:
        collection = get_collection(user_id, project_id)
        collection.delete(where={"document_id": {"$eq": document_id}})
        logger.info(f"Deleted chunks for doc {document_id} from ChromaDB")
    except Exception as e:
        logger.error(f"ChromaDB delete error: {e}")


def collection_count(user_id: int, project_id: Optional[int] = None) -> int:
    try:
        return get_collection(user_id, project_id).count()
    except Exception:
        return 0