"""
stats.py — Analytics endpoints
GET /api/stats          → overview stats
GET /api/stats/activity → daily activity (last 30 days)
"""

import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db
from app.models.document import Document, Chunk, Project
from app.models.chat import ChatSession, ChatMessage
from app.rag.neo4j_client import run_read
from app.rag.chroma_store import collection_count

router = APIRouter(prefix="/api/stats", tags=["stats"])
logger = logging.getLogger(__name__)


# ─── Overview stats ───────────────────────────────────────────────────────────
@router.get("")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.id

    # Document stats
    doc_result = await db.execute(
        select(func.count(Document.id)).where(Document.user_id == uid)
    )
    total_docs = doc_result.scalar() or 0

    ready_result = await db.execute(
        select(func.count(Document.id)).where(
            Document.user_id == uid,
            Document.status.in_(["ready", "embedded", "graph_ready"])
        )
    )
    ready_docs = ready_result.scalar() or 0

    # Chunk stats
    chunk_result = await db.execute(
        select(func.count(Chunk.id)).where(Chunk.user_id == uid)
    )
    total_chunks = chunk_result.scalar() or 0

    # Project stats
    proj_result = await db.execute(
        select(func.count(Project.id)).where(Project.user_id == uid)
    )
    total_projects = proj_result.scalar() or 0

    # Chat stats
    session_result = await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.user_id == uid)
    )
    total_sessions = session_result.scalar() or 0

    msg_result = await db.execute(
        select(func.count(ChatMessage.id)).where(ChatMessage.user_id == uid)
    )
    total_messages = msg_result.scalar() or 0

    # Feedback stats
    up_result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.user_id == uid,
            ChatMessage.citations.contains('"feedback": "up"')
        )
    )
    thumbs_up = up_result.scalar() or 0

    # Neo4j graph stats
    graph_nodes = 0
    graph_edges = 0
    try:
        node_result = run_read(
            f"MATCH (n:Entity {{user_id: {uid}}}) RETURN count(n) AS cnt"
        )
        graph_nodes = node_result[0]["cnt"] if node_result else 0

        edge_result = run_read(
            f"MATCH (a:Entity {{user_id: {uid}}})-[r:RELATES]->() RETURN count(r) AS cnt"
        )
        graph_edges = edge_result[0]["cnt"] if edge_result else 0
    except Exception as e:
        logger.warning(f"Neo4j stats failed: {e}")

    # ChromaDB vector count
    vector_count = 0
    try:
        vector_count = collection_count(uid, None)
    except Exception:
        pass

    return {
        "documents": {
            "total":  total_docs,
            "ready":  ready_docs,
            "chunks": total_chunks,
        },
        "projects": {
            "total": total_projects,
        },
        "chat": {
            "sessions":      total_sessions,
            "messages":      total_messages,
            "thumbs_up":     thumbs_up,
        },
        "graph": {
            "nodes": graph_nodes,
            "edges": graph_edges,
        },
        "vectors": {
            "total": vector_count,
        },
    }


# ─── Activity (last 30 days) ──────────────────────────────────────────────────
@router.get("/activity")
async def get_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid  = current_user.id
    now  = datetime.now(timezone.utc)
    days = 30

    # Get messages per day
    msg_result = await db.execute(
        select(ChatMessage.created_at).where(
            ChatMessage.user_id == uid,
            ChatMessage.created_at >= now - timedelta(days=days),
        )
    )
    messages = msg_result.scalars().all()

    # Get docs per day
    doc_result = await db.execute(
        select(Document.created_at).where(
            Document.user_id == uid,
            Document.created_at >= now - timedelta(days=days),
        )
    )
    docs = doc_result.scalars().all()

    # Build daily buckets
    buckets = {}
    for i in range(days):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        buckets[day] = {"date": day, "messages": 0, "documents": 0}

    for m in messages:
        day = m.strftime("%Y-%m-%d")
        if day in buckets:
            buckets[day]["messages"] += 1

    for d in docs:
        day = d.strftime("%Y-%m-%d")
        if day in buckets:
            buckets[day]["documents"] += 1

    return {
        "days": days,
        "activity": sorted(buckets.values(), key=lambda x: x["date"]),
    }