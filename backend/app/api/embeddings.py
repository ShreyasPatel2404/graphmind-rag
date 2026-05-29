"""
embeddings.py — API routes for embedding documents into ChromaDB
POST /api/embeddings/{doc_id}/process  → start embedding
GET  /api/embeddings/{doc_id}/status   → poll status
GET  /api/embeddings/health            → check Ollama is running
"""

import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db, AsyncSessionLocal
from app.models.document import Document, Chunk
from app.rag.ollama_client import embed_chunks, check_ollama_health
from app.rag.chroma_store import store_chunks, delete_document_chunks

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])
logger = logging.getLogger(__name__)


# ─── Schemas ──────────────────────────────────────────────────────────────────
class ProcessResponse(BaseModel):
    doc_id: int
    status: str
    message: str


class StatusResponse(BaseModel):
    doc_id: int
    status: str          # processing | embedded | error
    chunk_count: int
    error_msg: str | None


class OllamaHealthResponse(BaseModel):
    running: bool
    embed_model_ready: bool
    llm_model_ready: bool
    models: list[str]
    error: str | None = None


# ─── Background: embed document ───────────────────────────────────────────────
async def _embed_document(doc_id: int, user_id: int):
    """Fetch chunks from DB → embed → store in ChromaDB. Runs in background."""
    async with AsyncSessionLocal() as db:
        # Fetch document
        doc_result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            logger.error(f"Document {doc_id} not found for embedding")
            return

        # Must be in "ready" state (text already extracted)
        if doc.status not in ("ready", "embedded"):
            logger.error(f"Doc {doc_id} not ready for embedding (status={doc.status})")
            return

        # Mark as processing
        doc.status = "processing"
        await db.commit()

        try:
            # Fetch all chunks
            chunks_result = await db.execute(
                select(Chunk)
                .where(Chunk.document_id == doc_id)
                .order_by(Chunk.chunk_index)
            )
            chunks = chunks_result.scalars().all()

            if not chunks:
                doc.status = "error"
                doc.error_msg = "No chunks found — re-upload the document"
                await db.commit()
                return

            texts = [c.content for c in chunks]
            metadatas = [
                {
                    "chunk_index": c.chunk_index,
                    "char_start":  c.char_start or 0,
                    "char_end":    c.char_end   or 0,
                }
                for c in chunks
            ]

            logger.info(f"Embedding {len(texts)} chunks for doc {doc_id}…")

            # Delete old vectors if re-processing
            delete_document_chunks(user_id, doc_id, doc.project_id)

            # Embed (calls Ollama locally)
            vectors = embed_chunks(texts)

            # Store in ChromaDB
            store_chunks(
                user_id=user_id,
                document_id=doc_id,
                chunks=texts,
                vectors=vectors,
                project_id=doc.project_id,
                metadatas=metadatas,
            )

            doc.status = "embedded"
            doc.error_msg = None
            await db.commit()
            logger.info(f"Doc {doc_id} embedded successfully ({len(texts)} chunks)")

        except Exception as e:
            logger.error(f"Embedding failed for doc {doc_id}: {e}")
            doc.status = "error"
            doc.error_msg = f"Embedding failed: {str(e)[:200]}"
            await db.commit()


# ─── POST /process ────────────────────────────────────────────────────────────
@router.post("/{doc_id}/process", response_model=ProcessResponse)
async def process_document(
    doc_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.status == "processing":
        return ProcessResponse(doc_id=doc_id, status="processing", message="Already processing")

    if doc.status not in ("ready", "embedded", "error"):
        raise HTTPException(
            status_code=400,
            detail=f"Document must be in 'ready' state first (current: {doc.status})"
        )

    background_tasks.add_task(_embed_document, doc_id, current_user.id)
    return ProcessResponse(
        doc_id=doc_id,
        status="processing",
        message=f"Embedding {doc.chunk_count} chunks with Ollama…"
    )


# ─── GET /status ──────────────────────────────────────────────────────────────
@router.get("/{doc_id}/status", response_model=StatusResponse)
async def get_status(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return StatusResponse(
        doc_id=doc_id,
        status=doc.status,
        chunk_count=doc.chunk_count or 0,
        error_msg=doc.error_msg,
    )


# ─── GET /health ──────────────────────────────────────────────────────────────
@router.get("/health", response_model=OllamaHealthResponse)
async def ollama_health(_: User = Depends(get_current_user)):
    info = check_ollama_health()
    return OllamaHealthResponse(
        running=info.get("running", False),
        embed_model_ready=info.get("embed_model_ready", False),
        llm_model_ready=info.get("llm_model_ready", False),
        models=info.get("models", []),
        error=info.get("error"),
    )