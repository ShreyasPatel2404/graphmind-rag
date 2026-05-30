import os
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db
from app.models.document import Document, Chunk
from app.utils.file_parser import parse_file, parse_url
from app.utils.chunker import split_text

router = APIRouter(prefix="/api/documents", tags=["documents"])
logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path("uploads")
ALLOWED_TYPES = {"pdf", "docx", "txt"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ─── Schemas ───────────────────────────────────────────────────────────────────
class DocumentOut(BaseModel):
    id: int
    filename: str
    original_name: str
    file_type: str
    file_size: Optional[int]
    status: str
    error_msg: Optional[str]
    page_count: Optional[int]
    chunk_count: int
    source_url: Optional[str]
    created_at: str

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_dt(cls, doc: Document):
        return cls(
            id=doc.id,
            filename=doc.filename,
            original_name=doc.original_name,
            file_type=doc.file_type,
            file_size=doc.file_size,
            status=doc.status,
            error_msg=doc.error_msg,
            page_count=doc.page_count,
            chunk_count=doc.chunk_count,
            source_url=doc.source_url,
            created_at=doc.created_at.isoformat(),
        )


class URLIngestRequest(BaseModel):
    url: str
    project_id: Optional[int] = None


# ─── Background processing (Windows-safe) ─────────────────────────────────────
async def process_document(doc_id: int, file_bytes: bytes, file_type: str, db_factory):
    """Parse file + chunk + save chunks. Runs in background."""
    logger.info(f"Background processing started for doc {doc_id}")

    try:
        async with db_factory() as db:
            # Fetch document
            result = await db.execute(
                select(Document).where(Document.id == doc_id)
            )
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error(f"Doc {doc_id} not found in background task")
                return

            try:
                # 1. Parse
                logger.info(f"Parsing {file_type} for doc {doc_id}")
                parsed = parse_file(file_bytes, file_type)

                if parsed["error"]:
                    doc.status = "error"
                    doc.error_msg = parsed["error"]
                    await db.commit()
                    logger.error(f"Parse error for doc {doc_id}: {parsed['error']}")
                    return

                if not parsed["text"] or not parsed["text"].strip():
                    doc.status = "error"
                    doc.error_msg = "No text content could be extracted from this file"
                    await db.commit()
                    return

                # 2. Chunk
                logger.info(f"Chunking text for doc {doc_id}")
                raw_chunks = split_text(parsed["text"])

                if not raw_chunks:
                    doc.status = "error"
                    doc.error_msg = "Text was extracted but could not be split into chunks"
                    await db.commit()
                    return

                # 3. Save chunks (one by one to avoid batch issues on Windows)
                logger.info(f"Saving {len(raw_chunks)} chunks for doc {doc_id}")
                for c in raw_chunks:
                    chunk = Chunk(
                        document_id=doc_id,
                        user_id=doc.user_id,
                        chunk_index=c["chunk_index"],
                        content=c["content"],
                        char_start=c["char_start"],
                        char_end=c["char_end"],
                    )
                    db.add(chunk)

                # 4. Update document status
                doc.status      = "ready"
                doc.chunk_count = len(raw_chunks)
                doc.page_count  = parsed.get("page_count")
                doc.error_msg   = None

                await db.commit()
                logger.info(f"Doc {doc_id} processing complete: {len(raw_chunks)} chunks, status=ready")

            except Exception as e:
                logger.error(f"Processing error for doc {doc_id}: {e}", exc_info=True)
                try:
                    doc.status    = "error"
                    doc.error_msg = str(e)[:500]
                    await db.commit()
                except Exception as commit_err:
                    logger.error(f"Failed to save error state: {commit_err}")

    except Exception as outer_e:
        logger.error(f"Outer error in background task for doc {doc_id}: {outer_e}", exc_info=True)


# ─── Upload file ───────────────────────────────────────────────────────────────
@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate file type
    ext = Path(file.filename).suffix.lstrip(".").lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(ALLOWED_TYPES)}",
        )

    # Read file
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 20 MB.",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty.",
        )

    # Save to disk
    user_dir = UPLOAD_ROOT / str(current_user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{uuid.uuid4().hex}.{ext}"
    dest = user_dir / safe_filename
    dest.write_bytes(file_bytes)
    logger.info(f"Saved file {safe_filename} ({len(file_bytes)} bytes) for user {current_user.id}")

    # Create DB record
    doc = Document(
        user_id=current_user.id,
        project_id=project_id,
        filename=safe_filename,
        original_name=file.filename,
        file_type=ext,
        file_size=len(file_bytes),
        status="processing",
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    doc_id = doc.id
    await db.commit()

    logger.info(f"Created document record id={doc_id}, scheduling background task")

    from app.models.user import AsyncSessionLocal

    # Schedule background processing
    background_tasks.add_task(
        process_document, doc_id, file_bytes, ext, AsyncSessionLocal
    )

    return DocumentOut.from_orm_dt(doc)


# ─── Ingest URL ────────────────────────────────────────────────────────────────
@router.post("/ingest-url", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def ingest_url(
    payload: URLIngestRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = Document(
        user_id=current_user.id,
        project_id=payload.project_id,
        filename=f"url_{uuid.uuid4().hex}.txt",
        original_name=payload.url[:200],
        file_type="url",
        status="processing",
        source_url=payload.url,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    doc_id = doc.id
    await db.commit()

    from app.models.user import AsyncSessionLocal

    async def process_url_bg(did, url, db_factory):
        try:
            async with db_factory() as session:
                result = await session.execute(
                    select(Document).where(Document.id == did)
                )
                d = result.scalar_one_or_none()
                if not d:
                    return
                try:
                    parsed = parse_url(url)
                    if parsed["error"]:
                        d.status    = "error"
                        d.error_msg = parsed["error"]
                        await session.commit()
                        return
                    raw_chunks = split_text(parsed["text"])
                    for c in raw_chunks:
                        session.add(Chunk(
                            document_id=did,
                            user_id=d.user_id,
                            chunk_index=c["chunk_index"],
                            content=c["content"],
                            char_start=c["char_start"],
                            char_end=c["char_end"],
                        ))
                    d.status      = "ready"
                    d.chunk_count = len(raw_chunks)
                    d.error_msg   = None
                    await session.commit()
                except Exception as e:
                    d.status    = "error"
                    d.error_msg = str(e)[:500]
                    await session.commit()
        except Exception as e:
            logger.error(f"URL ingest bg error: {e}", exc_info=True)

    background_tasks.add_task(process_url_bg, doc_id, payload.url, AsyncSessionLocal)
    return DocumentOut.from_orm_dt(doc)


# ─── List documents ────────────────────────────────────────────────────────────
@router.get("", response_model=list[DocumentOut])
async def list_documents(
    project_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Document).where(Document.user_id == current_user.id)
    if project_id:
        q = q.where(Document.project_id == project_id)
    q = q.order_by(Document.created_at.desc())
    result = await db.execute(q)
    docs = result.scalars().all()
    return [DocumentOut.from_orm_dt(d) for d in docs]


# ─── Get single document ───────────────────────────────────────────────────────
@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentOut.from_orm_dt(doc)


# ─── Delete document ───────────────────────────────────────────────────────────
@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file from disk
    file_path = UPLOAD_ROOT / str(current_user.id) / doc.filename
    if file_path.exists():
        file_path.unlink()

    await db.delete(doc)
    await db.commit()