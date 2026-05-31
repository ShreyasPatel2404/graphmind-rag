from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.models.user import User, get_db
from app.models.document import Project, Document
from app.rag.neo4j_client import run_read

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ─── Schemas ───────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    document_ids: Optional[list[int]] = []


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: str
    document_count: int = 0

    @classmethod
    def from_orm(cls, p: Project, doc_count: int = 0):
        return cls(
            id=p.id,
            name=p.name,
            description=p.description,
            created_at=p.created_at.isoformat(),
            document_count=doc_count,
        )


class AddDocumentsRequest(BaseModel):
    document_ids: list[int]


class ProjectGraphData(BaseModel):
    project_id: int
    nodes: list[dict]
    edges: list[dict]
    node_count: int
    edge_count: int
    document_count: int


# ─── Create ────────────────────────────────────────────────────────────────────
@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)

    doc_count = 0
    if payload.document_ids:
        result = await db.execute(
            select(Document).where(
                Document.id.in_(payload.document_ids),
                Document.user_id == current_user.id,
            )
        )
        docs = result.scalars().all()
        for doc in docs:
            doc.project_id = project.id
        doc_count = len(docs)

    await db.commit()
    return ProjectOut.from_orm(project, doc_count)


# ─── List ──────────────────────────────────────────────────────────────────────
@router.get("", response_model=list[ProjectOut])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()

    out = []
    for p in projects:
        doc_result = await db.execute(
            select(Document).where(Document.project_id == p.id)
        )
        count = len(doc_result.scalars().all())
        out.append(ProjectOut.from_orm(p, count))
    return out


# ─── Get ───────────────────────────────────────────────────────────────────────
@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    doc_result = await db.execute(
        select(Document).where(Document.project_id == p.id)
    )
    count = len(doc_result.scalars().all())
    return ProjectOut.from_orm(p, count)


# ─── Project documents ────────────────────────────────────────────────────────
@router.get("/{project_id}/documents")
async def get_project_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    doc_result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.user_id == current_user.id,
        ).order_by(Document.created_at.desc())
    )
    docs = doc_result.scalars().all()
    return [
        {
            "id":            d.id,
            "original_name": d.original_name,
            "file_type":     d.file_type,
            "status":        d.status,
            "chunk_count":   d.chunk_count,
            "created_at":    d.created_at.isoformat(),
        }
        for d in docs
    ]


# ─── Add documents ─────────────────────────────────────────────────────────────
@router.post("/{project_id}/documents", status_code=200)
async def add_documents(
    project_id: int,
    payload: AddDocumentsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    doc_result = await db.execute(
        select(Document).where(
            Document.id.in_(payload.document_ids),
            Document.user_id == current_user.id,
        )
    )
    docs = doc_result.scalars().all()
    for doc in docs:
        doc.project_id = project_id
    await db.commit()
    return {"added": len(docs), "project_id": project_id}


# ─── Remove document ──────────────────────────────────────────────────────────
@router.delete("/{project_id}/documents/{doc_id}", status_code=200)
async def remove_document(
    project_id: int,
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.user_id == current_user.id,
            Document.project_id == project_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in project")
    doc.project_id = None
    await db.commit()
    return {"removed": doc_id, "project_id": project_id}


# ─── Project graph (merged across all docs) ────────────────────────────────────
@router.get("/{project_id}/graph", response_model=ProjectGraphData)
async def get_project_graph(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all doc_ids in this project
    doc_result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.user_id == current_user.id,
        )
    )
    docs = doc_result.scalars().all()
    doc_ids = [d.id for d in docs]

    if not doc_ids:
        return ProjectGraphData(
            project_id=project_id,
            nodes=[], edges=[],
            node_count=0, edge_count=0,
            document_count=0,
        )

    # Fetch merged graph from Neo4j across all doc_ids
    ids_str = ", ".join(str(i) for i in doc_ids)

    node_result = run_read(
        f"""
        MATCH (n:Entity)
        WHERE n.user_id = {current_user.id} AND n.doc_id IN [{ids_str}]
        RETURN n.name AS name, n.type AS type, n.doc_id AS doc_id
        """
    )
    edge_result = run_read(
        f"""
        MATCH (a:Entity)-[r:RELATES]->(b:Entity)
        WHERE a.user_id = {current_user.id}
          AND a.doc_id IN [{ids_str}]
          AND b.doc_id IN [{ids_str}]
        RETURN a.name AS source, b.name AS target, r.relation AS relation
        """
    )

    nodes = [
        {
            "id":    n["name"],
            "label": n["name"],
            "type":  n.get("type") or "Concept",
            "doc_id": n.get("doc_id"),
        }
        for n in node_result
    ]
    node_names = {n["id"] for n in nodes}
    edges = [
        {"source": e["source"], "target": e["target"], "relation": e["relation"]}
        for e in edge_result
        if e["source"] in node_names and e["target"] in node_names
    ]

    return ProjectGraphData(
        project_id=project_id,
        nodes=nodes, edges=edges,
        node_count=len(nodes), edge_count=len(edges),
        document_count=len(docs),
    )


# ─── Delete project ────────────────────────────────────────────────────────────
@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    doc_result = await db.execute(
        select(Document).where(Document.project_id == project_id)
    )
    for doc in doc_result.scalars().all():
        doc.project_id = None

    await db.delete(p)
    await db.commit()