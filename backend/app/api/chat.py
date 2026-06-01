"""
chat.py — Chat API with SSE streaming + CRAG + confidence scores + feedback
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db
from app.models.document import Document
from app.models.chat import ChatSession, ChatMessage
from app.rag.retriever import hybrid_retrieve
from app.rag.crag import corrective_retrieve
from app.rag.citations import build_citations
from app.rag.ollama_client import generate_stream

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are GraphMind RAG, an intelligent assistant that answers questions based on provided documents.

Instructions:
- Answer ONLY based on the provided context (document excerpts and knowledge graph facts)
- If the context doesn't contain enough information, say so clearly
- Be concise and precise
- Reference specific information from the excerpts when possible
- Do not make up information not present in the context"""


# ─── Schemas ──────────────────────────────────────────────────────────────────
class SessionCreate(BaseModel):
    title: Optional[str] = "New Chat"
    project_id: Optional[int] = None


class SessionOut(BaseModel):
    id: int
    title: str
    project_id: Optional[int]
    created_at: str
    message_count: int = 0


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    citations: Optional[list[dict]] = None
    confidence: Optional[dict] = None
    created_at: str


class StreamRequest(BaseModel):
    message: str
    session_id: Optional[int] = None
    document_ids: Optional[list[int]] = None
    project_id: Optional[int] = None
    use_crag: bool = True          # ← CRAG on by default


class FeedbackRequest(BaseModel):
    message_id: int
    feedback: str                  # "up" | "down"


# ─── Create session ───────────────────────────────────────────────────────────
@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = ChatSession(
        user_id=current_user.id,
        project_id=payload.project_id,
        title=payload.title or "New Chat",
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return SessionOut(
        id=session.id,
        title=session.title,
        project_id=session.project_id,
        created_at=session.created_at.isoformat(),
        message_count=0,
    )


# ─── List sessions ────────────────────────────────────────────────────────────
@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    sessions = result.scalars().all()
    out = []
    for s in sessions:
        msgs = await db.execute(
            select(ChatMessage).where(ChatMessage.session_id == s.id)
        )
        count = len(msgs.scalars().all())
        out.append(SessionOut(
            id=s.id,
            title=s.title,
            project_id=s.project_id,
            created_at=s.created_at.isoformat(),
            message_count=count,
        ))
    return out


# ─── Get messages ─────────────────────────────────────────────────────────────
@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def get_messages(
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
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    msg_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = msg_result.scalars().all()

    out = []
    for m in messages:
        citations = None
        confidence = None
        if m.citations:
            try:
                data = json.loads(m.citations)
                if isinstance(data, dict):
                    citations  = data.get("citations")
                    confidence = data.get("confidence")
                else:
                    citations = data
            except Exception:
                pass
        out.append(MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=citations,
            confidence=confidence,
            created_at=m.created_at.isoformat(),
        ))
    return out


# ─── Delete session ───────────────────────────────────────────────────────────
@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()


# ─── Feedback ─────────────────────────────────────────────────────────────────
@router.post("/feedback")
async def submit_feedback(
    payload: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == payload.message_id,
            ChatMessage.user_id == current_user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Store feedback in citations JSON blob
    try:
        data = json.loads(msg.citations) if msg.citations else {}
        if not isinstance(data, dict):
            data = {"citations": data}
        data["feedback"] = payload.feedback
        msg.citations = json.dumps(data)
        await db.commit()
    except Exception as e:
        logger.error(f"Feedback save failed: {e}")

    return {"message_id": payload.message_id, "feedback": payload.feedback}


# ─── SSE streaming chat ───────────────────────────────────────────────────────
@router.post("/stream")
async def stream_chat(
    payload: StreamRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # ── Get or create session ─────────────────────────────────────────────
    if payload.session_id:
        sess_result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == payload.session_id,
                ChatSession.user_id == current_user.id,
            )
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        title = payload.message[:60] + ("…" if len(payload.message) > 60 else "")
        session = ChatSession(
            user_id=current_user.id,
            project_id=payload.project_id,
            title=title,
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)

    session_id = session.id

    # ── Save user message ─────────────────────────────────────────────────
    user_msg = ChatMessage(
        session_id=session_id,
        user_id=current_user.id,
        role="user",
        content=payload.message,
    )
    db.add(user_msg)
    await db.commit()

    # ── Hybrid retrieval ──────────────────────────────────────────────────
    confidence = {"score": 0.0, "label": "Low", "reason": "No context retrieved"}
    citations  = []
    context    = ""

    try:
        retrieved = hybrid_retrieve(
            query=payload.message,
            user_id=current_user.id,
            project_id=payload.project_id,
            document_ids=payload.document_ids,
            top_k=5,
        )

        if payload.use_crag and retrieved["vector_chunks"]:
            # ── CRAG pipeline ─────────────────────────────────────────────
            crag_result = corrective_retrieve(
                query=payload.message,
                user_id=current_user.id,
                initial_chunks=retrieved["vector_chunks"],
                graph_facts=retrieved["graph_facts"],
                project_id=payload.project_id,
                document_ids=payload.document_ids,
            )
            context    = crag_result["context"]
            confidence = crag_result["confidence"]
            sources    = crag_result["chunks"]
            logger.info(
                f"CRAG confidence: {confidence['label']} ({confidence['score']}) "
                f"rewrite={crag_result['used_rewrite']}"
            )
        else:
            context = retrieved["context"]
            sources = retrieved["sources"]
            # Basic confidence from distance scores
            if sources:
                avg_dist = sum(s.get("distance", 0.5) for s in sources) / len(sources)
                score    = round(max(0.0, 1.0 - avg_dist), 3)
                confidence = {
                    "score":  score,
                    "label":  "High" if score >= 0.7 else "Medium" if score >= 0.45 else "Low",
                    "reason": f"Based on {len(sources)} retrieved chunks",
                }

        # ── Build citations ───────────────────────────────────────────────
        doc_ids = list({s["document_id"] for s in sources if s.get("document_id")})
        doc_name_map = {}
        if doc_ids:
            doc_result = await db.execute(
                select(Document).where(
                    Document.id.in_(doc_ids),
                    Document.user_id == current_user.id,
                )
            )
            for doc in doc_result.scalars().all():
                doc_name_map[doc.id] = doc.original_name
        citations = build_citations(sources, doc_name_map)

    except Exception as e:
        logger.error(f"Retrieval/CRAG failed: {e}", exc_info=True)
        context  = ""
        sources  = []

    # ── SSE generator ─────────────────────────────────────────────────────
    async def event_stream():
        full_response = []

        yield f"data: {json.dumps({'type': 'session_id', 'session_id': session_id})}\n\n"

        # Send confidence early so UI can show it immediately
        yield f"data: {json.dumps({'type': 'confidence', 'confidence': confidence})}\n\n"

        try:
            for token in generate_stream(
                prompt=payload.message,
                context=context,
                system=SYSTEM_PROMPT,
            ):
                full_response.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except Exception as e:
            error_msg = f"Generation failed: {str(e)}"
            yield f"data: {json.dumps({'type': 'error', 'content': error_msg})}\n\n"
            full_response = [error_msg]

        if citations:
            yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"

        # Save assistant message
        try:
            from app.models.user import AsyncSessionLocal
            async with AsyncSessionLocal() as save_db:
                payload_data = json.dumps({
                    "citations":  citations,
                    "confidence": confidence,
                }) if (citations or confidence) else None

                assistant_msg = ChatMessage(
                    session_id=session_id,
                    user_id=current_user.id,
                    role="assistant",
                    content="".join(full_response),
                    citations=payload_data,
                )
                save_db.add(assistant_msg)

                # Send message_id back so frontend can submit feedback
                await save_db.flush()
                await save_db.refresh(assistant_msg)
                msg_id = assistant_msg.id

                sess_result = await save_db.execute(
                    select(ChatSession).where(ChatSession.id == session_id)
                )
                sess = sess_result.scalar_one_or_none()
                if sess:
                    from datetime import datetime, timezone
                    sess.updated_at = datetime.now(timezone.utc)
                await save_db.commit()

                yield f"data: {json.dumps({'type': 'message_id', 'message_id': msg_id})}\n\n"

        except Exception as e:
            logger.error(f"Failed to save assistant message: {e}")

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )