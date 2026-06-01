import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db, AsyncSessionLocal
from app.models.document import Document, Chunk
from app.rag.graph_builder import build_graph_from_chunks, fetch_graph_json
from app.rag.neo4j_client import check_neo4j_health, run_read

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


class GraphSearchResult(BaseModel):
    node: str
    node_type: str
    connections: list[dict]
    doc_id: int | None


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
                project_id=doc.project_id,
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


# ─── GET /health ─────────────────────────────────────────────────────────────
@router.get("/health", response_model=Neo4jHealth)
async def neo4j_health(_: User = Depends(get_current_user)):
    info = check_neo4j_health()
    return Neo4jHealth(**info)


# ─── GET /search ──────────────────────────────────────────────────────────────
@router.get("/search")
async def search_graph(
    q: str = Query(..., min_length=1, description="Entity name to search"),
    current_user: User = Depends(get_current_user),
):
    """Search for entities in the graph by name and return their neighbors."""
    try:
        results = run_read(
            f"""
            MATCH (n:Entity)
            WHERE toLower(n.name) CONTAINS toLower('{q.replace("'", "")}')
              AND n.user_id = {current_user.id}
            WITH n LIMIT 10
            OPTIONAL MATCH (n)-[r:RELATES]-(neighbor:Entity)
            RETURN
                n.name       AS node,
                n.type       AS node_type,
                n.doc_id     AS doc_id,
                collect({{
                    neighbor: neighbor.name,
                    relation: r.relation,
                    direction: CASE WHEN startNode(r) = n THEN 'out' ELSE 'in' END
                }}) AS connections
            """
        )

        out = []
        for row in results:
            conns = [
                c for c in (row.get("connections") or [])
                if c.get("neighbor") is not None
            ]
            out.append({
                "node":        row.get("node"),
                "node_type":   row.get("node_type") or "Concept",
                "doc_id":      row.get("doc_id"),
                "connections": conns[:10],
            })
        return {"query": q, "results": out, "count": len(out)}

    except Exception as e:
        logger.error(f"Graph search error: {e}")
        return {"query": q, "results": [], "count": 0}


# ─── GET /status/{doc_id} ────────────────────────────────────────────────────
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