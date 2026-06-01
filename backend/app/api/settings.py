"""
settings.py — User settings + export
GET    /api/settings          → get current settings
PUT    /api/settings          → update settings
GET    /api/settings/models   → list available Ollama models
GET    /api/chat/{id}/export  → export chat as JSON
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import ollama

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db
from app.models.settings import UserSettings
from app.models.chat import ChatSession, ChatMessage
from app.config import get_settings

router   = APIRouter(prefix="/api/settings", tags=["settings"])
logger   = logging.getLogger(__name__)
config   = get_settings()


# ─── Schemas ──────────────────────────────────────────────────────────────────
class SettingsOut(BaseModel):
    ollama_model:  str
    embed_model:   str
    chunk_size:    int
    chunk_overlap: int
    retrieval_k:   int
    use_crag:      bool


class SettingsUpdate(BaseModel):
    ollama_model:  Optional[str] = None
    embed_model:   Optional[str] = None
    chunk_size:    Optional[int] = None
    chunk_overlap: Optional[int] = None
    retrieval_k:   Optional[int] = None
    use_crag:      Optional[bool] = None


# ─── Get settings ─────────────────────────────────────────────────────────────
@router.get("", response_model=SettingsOut)
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )
    s = result.scalar_one_or_none()

    if not s:
        # Return defaults from config
        return SettingsOut(
            ollama_model=config.ollama_model,
            embed_model=config.ollama_embed_model,
            chunk_size=2000,
            chunk_overlap=200,
            retrieval_k=5,
            use_crag=True,
        )

    return SettingsOut(
        ollama_model=s.ollama_model,
        embed_model=s.embed_model,
        chunk_size=s.chunk_size,
        chunk_overlap=s.chunk_overlap,
        retrieval_k=s.retrieval_k,
        use_crag=bool(s.use_crag),
    )


# ─── Update settings ──────────────────────────────────────────────────────────
@router.put("", response_model=SettingsOut)
async def update_settings(
    payload: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )
    s = result.scalar_one_or_none()

    if not s:
        s = UserSettings(
            user_id=current_user.id,
            ollama_model=config.ollama_model,
            embed_model=config.ollama_embed_model,
            chunk_size=2000,
            chunk_overlap=200,
            retrieval_k=5,
            use_crag=1,
        )
        db.add(s)

    if payload.ollama_model  is not None: s.ollama_model  = payload.ollama_model
    if payload.embed_model   is not None: s.embed_model   = payload.embed_model
    if payload.chunk_size    is not None: s.chunk_size    = max(200, min(8000, payload.chunk_size))
    if payload.chunk_overlap is not None: s.chunk_overlap = max(0,   min(500,  payload.chunk_overlap))
    if payload.retrieval_k   is not None: s.retrieval_k   = max(1,   min(20,   payload.retrieval_k))
    if payload.use_crag      is not None: s.use_crag      = 1 if payload.use_crag else 0

    await db.commit()
    await db.refresh(s)

    return SettingsOut(
        ollama_model=s.ollama_model,
        embed_model=s.embed_model,
        chunk_size=s.chunk_size,
        chunk_overlap=s.chunk_overlap,
        retrieval_k=s.retrieval_k,
        use_crag=bool(s.use_crag),
    )


# ─── List Ollama models ────────────────────────────────────────────────────────
@router.get("/models")
async def list_models(_: User = Depends(get_current_user)):
    try:
        response = ollama.list()
        models = []
        for m in response.get("models", []):
            # name = m.get("name", "")
            name = m.get("model")
            size = m.get("size", 0)
            models.append({
                "name":     name,
                "size_gb":  round(size / 1e9, 1) if size else None,
                "is_embed": "embed" in name.lower() or "nomic" in name.lower(),
            })
        return {"models": models, "count": len(models)}
    except Exception as e:
        logger.warning(f"Ollama list failed: {e}")
        return {"models": [], "count": 0, "error": str(e)}


# ─── Export chat as JSON ──────────────────────────────────────────────────────
# (under /api/chat prefix for logical grouping but defined here)
export_router = APIRouter(prefix="/api/chat", tags=["chat"])

@export_router.get("/{session_id}/export")
async def export_chat(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess_result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msg_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = msg_result.scalars().all()

    export_data = {
        "session": {
            "id":         session.id,
            "title":      session.title,
            "created_at": session.created_at.isoformat(),
        },
        "messages": [
            {
                "role":       m.role,
                "content":    m.content,
                "created_at": m.created_at.isoformat(),
                "citations":  json.loads(m.citations).get("citations") if m.citations else None,
                "confidence": json.loads(m.citations).get("confidence") if m.citations else None,
            }
            for m in messages
        ],
        "exported_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }

    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f'attachment; filename="chat_{session_id}.json"',
        },
    )