import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db, AsyncSessionLocal
from app.models.document import Document, Chunk
from app.rag.graph_builder import build_graph_from_chunks, fetch_graph_json
from app.rag.neo4j_client import check_neo4j_health

router = APIRouter(prefix="/api/graph", tags=["graph"])
logger = logging.getLogger(__name__)


class BuildResponse(BaseModel):
    doc_id: int
    status: str
    message: str


class GraphData(BaseModel):
    doc_id: int
    nodes: list[dict]
    edges: list[dict]
    node_count: int
    edge_count: int


class Neo4jHealth(BaseModel):
    connected: bool
    uri: str | None = None
    error: str | None = None


async def _build_graph_bg(doc_id: int, user_id: int):
    async with AsyncSessionLocal() as db:
        doc_result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            return

        doc.status = "graph_building"
        await db.commit()

        try:
            chunks_result = await db.execute(
                select(Chunk)
                .where(Chunk.document_id == doc_id)
                .order_by(Chunk.chunk_index)
            )
            chunks = chunks_result.scalars().all()
            if not chunks:
                doc.status = "embedded"
                doc.error_msg = "No chunks found"
                await db.commit()
                return

            texts = [c.content for c in chunks]
            stats = build_graph_from_chunks(
                chunks=texts,
                doc_id=doc_id,
                user_id=user_id,
                max_chunks=15,
                project_id=doc.project_id,   # ← pass project_id for tagging
            )
            doc.status    = "graph_ready"
            doc.error_msg = None
            await db.commit()
            logger.info(f"Graph built for doc {doc_id}: {stats}")

        except Exception as e:
            logger.error(f"Graph build failed for doc {doc_id}: {e}")
            doc.status    = "embedded"
            doc.error_msg = f"Graph build failed: {str(e)[:200]}"
            await db.commit()


# ─── POST /build/{doc_id} ─────────────────────────────────────────────────────
@router.post("/build/{doc_id}", response_model=BuildResponse)
async def build_graph(
    doc_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status == "graph_building":
        return BuildResponse(doc_id=doc_id, status="graph_building", message="Already building")
    if doc.status not in ("embedded", "graph_ready", "error"):
        raise HTTPException(status_code=400,
            detail=f"Document must be embedded first (status: {doc.status})")

    background_tasks.add_task(_build_graph_bg, doc_id, current_user.id)
    return BuildResponse(doc_id=doc_id, status="graph_building",
                         message="Building knowledge graph…")


# ─── GET /health ──────────────────────────────────────────────────────────────
@router.get("/health", response_model=Neo4jHealth)
async def neo4j_health(_: User = Depends(get_current_user)):
    info = check_neo4j_health()
    return Neo4jHealth(**info)


# ─── GET /status/{doc_id} ─────────────────────────────────────────────────────
@router.get("/status/{doc_id}")
async def graph_status(
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
    return {"doc_id": doc_id, "status": doc.status, "error_msg": doc.error_msg}


# ─── GET /{doc_id} ────────────────────────────────────────────────────────────
@router.get("/{doc_id}", response_model=GraphData)
async def get_graph(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    graph = fetch_graph_json(doc_id, current_user.id)
    return GraphData(doc_id=doc_id, **graph)