from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.user import init_db
from app.models.document import Document, Project, Chunk
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.projects import router as projects_router
from app.api.embeddings import router as embeddings_router
from app.api.graph import router as graph_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path("uploads").mkdir(exist_ok=True)
    Path("chroma_db").mkdir(exist_ok=True)
    await init_db()
    print("✅ GraphMind RAG v0.4.0 — Auth + Documents + Embeddings + Knowledge Graph ready")
    yield
    print("👋 Shutting down")


app = FastAPI(
    title="GraphMind RAG API",
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(projects_router)
app.include_router(embeddings_router)
app.include_router(graph_router)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "version": "0.4.0"}