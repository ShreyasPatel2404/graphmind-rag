from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text, Boolean
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.models.user import Base


# ─── Project ───────────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")


# ─── Document ──────────────────────────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id",    ondelete="CASCADE"), nullable=False)
    project_id   = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    filename     = Column(String(512), nullable=False)
    original_name= Column(String(512), nullable=False)
    file_type    = Column(String(50),  nullable=False)   # pdf | docx | txt | url
    file_size    = Column(Integer,     nullable=True)    # bytes
    status       = Column(String(50),  default="processing")  # processing | ready | error
    error_msg    = Column(Text,        nullable=True)
    page_count   = Column(Integer,     nullable=True)
    chunk_count  = Column(Integer,     default=0)
    source_url   = Column(Text,        nullable=True)    # for URL ingestion
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                          onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="documents")
    chunks  = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


# ─── Chunk ─────────────────────────────────────────────────────────────────────
class Chunk(Base):
    __tablename__ = "chunks"

    id          = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(Integer, ForeignKey("users.id",     ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content     = Column(Text,    nullable=False)
    char_start  = Column(Integer, nullable=True)
    char_end    = Column(Integer, nullable=True)
    page_number = Column(Integer, nullable=True)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="chunks")