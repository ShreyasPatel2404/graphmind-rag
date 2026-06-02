"""
graph.py — Knowledge Graph API
Day 9 additions:
  GET /api/graph/{id}/stats    → node count, edge count, top connected entities
  GET /api/graph/{id}/entities → all entities with type + degree
  GET /api/graph/{id}/path     → shortest path between two entities
  GET /api/graph/{id}/export   → full graph as JSON download
  GET /api/graph/search        → entity search
  GET /api/graph/health        → Neo4j connectivity
"""

import json
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
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


# ─── Schemas ──────────────────────────────────────────────────────────────────
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


# ─── Background: build graph ──────────────────────────────────────────────────
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
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    try:
        safe_q = q.replace("'", "").replace('"', "")
        results = run_read(
            f"""
            MATCH (n:Entity)
            WHERE toLower(n.name) CONTAINS toLower('{safe_q}')
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
            conns = [c for c in (row.get("connections") or []) if c.get("neighbor")]
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


# ─── GET /{doc_id}/stats ──────────────────────────────────────────────────────
@router.get("/{doc_id}/stats")
async def graph_stats(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        # Node count
        node_res = run_read(
            "MATCH (n:Entity {doc_id: $doc_id, user_id: $user_id}) RETURN count(n) AS cnt",
            {"doc_id": doc_id, "user_id": current_user.id}
        )
        node_count = node_res[0]["cnt"] if node_res else 0

        # Edge count
        edge_res = run_read(
            "MATCH (a:Entity {doc_id: $doc_id, user_id: $user_id})-[r:RELATES]->() RETURN count(r) AS cnt",
            {"doc_id": doc_id, "user_id": current_user.id}
        )
        edge_count = edge_res[0]["cnt"] if edge_res else 0

        # Type distribution
        type_res = run_read(
            """
            MATCH (n:Entity {doc_id: $doc_id, user_id: $user_id})
            RETURN n.type AS type, count(n) AS cnt
            ORDER BY cnt DESC
            """,
            {"doc_id": doc_id, "user_id": current_user.id}
        )
        type_dist = {r["type"] or "Concept": r["cnt"] for r in type_res}

        # Top connected entities (by degree)
        top_res = run_read(
            """
            MATCH (n:Entity {doc_id: $doc_id, user_id: $user_id})
            OPTIONAL MATCH (n)-[r:RELATES]-()
            WITH n, count(r) AS degree
            ORDER BY degree DESC LIMIT 10
            RETURN n.name AS name, n.type AS type, degree
            """,
            {"doc_id": doc_id, "user_id": current_user.id}
        )
        top_entities = [{"name": r["name"], "type": r["type"], "degree": r["degree"]} for r in top_res]

        return {
            "doc_id":       doc_id,
            "node_count":   node_count,
            "edge_count":   edge_count,
            "type_dist":    type_dist,
            "top_entities": top_entities,
        }
    except Exception as e:
        logger.error(f"Graph stats error: {e}")
        return {"doc_id": doc_id, "node_count": 0, "edge_count": 0,
                "type_dist": {}, "top_entities": []}


# ─── GET /{doc_id}/entities ───────────────────────────────────────────────────
@router.get("/{doc_id}/entities")
async def graph_entities(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        rows = run_read(
            """
            MATCH (n:Entity {doc_id: $doc_id, user_id: $user_id})
            OPTIONAL MATCH (n)-[r:RELATES]-()
            WITH n, count(r) AS degree
            ORDER BY degree DESC
            RETURN n.name AS name, n.type AS type, degree
            """,
            {"doc_id": doc_id, "user_id": current_user.id}
        )
        entities = [
            {"name": r["name"], "type": r["type"] or "Concept", "degree": r["degree"]}
            for r in rows
        ]
        return {"doc_id": doc_id, "entities": entities, "count": len(entities)}
    except Exception as e:
        logger.error(f"Entities fetch error: {e}")
        return {"doc_id": doc_id, "entities": [], "count": 0}


# ─── GET /{doc_id}/path ───────────────────────────────────────────────────────
@router.get("/{doc_id}/path")
async def find_path(
    doc_id: int,
    from_entity: str = Query(..., alias="from"),
    to_entity:   str = Query(..., alias="to"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        rows = run_read(
            """
            MATCH (a:Entity {name: $from_e, doc_id: $doc_id, user_id: $user_id}),
                  (b:Entity {name: $to_e,   doc_id: $doc_id, user_id: $user_id})
            MATCH p = shortestPath((a)-[*..8]-(b))
            RETURN [node IN nodes(p) | node.name]          AS node_names,
                   [node IN nodes(p) | node.type]          AS node_types,
                   [rel  IN relationships(p) | rel.relation] AS relations
            LIMIT 1
            """,
            {
                "from_e":  from_entity,
                "to_e":    to_entity,
                "doc_id":  doc_id,
                "user_id": current_user.id,
            }
        )

        if not rows:
            return {
                "found":      False,
                "from":       from_entity,
                "to":         to_entity,
                "path_nodes": [],
                "path_edges": [],
            }

        row        = rows[0]
        node_names = row["node_names"]
        node_types = row["node_types"]
        relations  = row["relations"]

        path_nodes = [
            {"id": name, "label": name, "type": node_types[i] or "Concept"}
            for i, name in enumerate(node_names)
        ]
        path_edges = [
            {
                "source":   node_names[i],
                "target":   node_names[i + 1],
                "relation": relations[i] if i < len(relations) else "",
            }
            for i in range(len(node_names) - 1)
        ]

        return {
            "found":      True,
            "from":       from_entity,
            "to":         to_entity,
            "length":     len(node_names) - 1,
            "path_nodes": path_nodes,
            "path_edges": path_edges,
        }

    except Exception as e:
        logger.error(f"Path find error: {e}")
        return {"found": False, "from": from_entity, "to": to_entity,
                "path_nodes": [], "path_edges": []}


# ─── GET /{doc_id}/export ────────────────────────────────────────────────────
@router.get("/{doc_id}/export")
async def export_graph(
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

    graph = fetch_graph_json(doc_id, current_user.id)

    export_data = {
        "document":   {"id": doc_id, "name": doc.original_name},
        "nodes":      graph["nodes"],
        "edges":      graph["edges"],
        "node_count": graph["node_count"],
        "edge_count": graph["edge_count"],
        "exported_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
    }

    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f'attachment; filename="graph_{doc_id}.json"',
        },
    )


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