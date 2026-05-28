from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import get_settings
from app.models.user import init_db
from app.models.document import Document, Project, Chunk  # ensure tables are registered
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.projects import router as projects_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure upload dir exists
    Path("uploads").mkdir(exist_ok=True)
    # Create all tables
    await init_db()
    print(f"✅ GraphMind RAG started — DB initialised (Day 2: documents + projects ready)")
    yield
    print("👋 GraphMind RAG shutting down")


app = FastAPI(
    title="GraphMind RAG API",
    description="Knowledge Graph + Vector RAG backend",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(projects_router)


# ─── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "version": "0.2.0"}