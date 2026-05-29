"""
chroma_store.py — ChromaDB wrapper
One collection per user: "user_{user_id}_docs"
"""

import logging
from typing import List, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── Client (persistent local storage) ───────────────────────────────────────
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
    # ChromaDB collection names: only alphanumeric + underscores
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


# ─── Store chunks ─────────────────────────────────────────────────────────────
def store_chunks(
    user_id: int,
    document_id: int,
    chunks: List[str],
    vectors: List[List[float]],
    project_id: Optional[int] = None,
    metadatas: Optional[List[dict]] = None,
):
    """
    Upsert chunk embeddings into ChromaDB.
    IDs are scoped to document: doc_{doc_id}_chunk_{idx}
    """
    collection = get_collection(user_id, project_id)

    ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(chunks))]

    base_meta = {"document_id": document_id, "user_id": user_id}
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
    logger.info(f"Stored {len(chunks)} chunks for doc {document_id} in ChromaDB")


# ─── Query ────────────────────────────────────────────────────────────────────
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

        where = None
        if document_ids:
            where = {"document_id": {"$in": document_ids}}

        results = collection.query(
            query_embeddings=[query_vector],
            n_results=min(n_results, collection.count() or 1),
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        output = []
        for i, doc in enumerate(results["documents"][0]):
            output.append({
                "content":     doc,
                "document_id": results["metadatas"][0][i].get("document_id"),
                "distance":    results["distances"][0][i],
                "chunk_index": results["metadatas"][0][i].get("chunk_index", i),
            })
        return output
    except Exception as e:
        logger.error(f"ChromaDB query error: {e}")
        return []


# ─── Delete document chunks ───────────────────────────────────────────────────
def delete_document_chunks(user_id: int, document_id: int, project_id: Optional[int] = None):
    """Remove all chunks for a document from ChromaDB."""
    try:
        collection = get_collection(user_id, project_id)
        collection.delete(where={"document_id": document_id})
        logger.info(f"Deleted chunks for doc {document_id} from ChromaDB")
    except Exception as e:
        logger.error(f"ChromaDB delete error: {e}")


# ─── Stats ────────────────────────────────────────────────────────────────────
def collection_count(user_id: int, project_id: Optional[int] = None) -> int:
    try:
        return get_collection(user_id, project_id).count()
    except Exception:
        return 0