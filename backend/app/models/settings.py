from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from datetime import datetime, timezone
from app.models.user import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                           nullable=False, unique=True)
    ollama_model  = Column(String(100), default="llama3.2")
    embed_model   = Column(String(100), default="nomic-embed-text")
    chunk_size    = Column(Integer,     default=2000)
    chunk_overlap = Column(Integer,     default=200)
    retrieval_k   = Column(Integer,     default=5)
    use_crag      = Column(Integer,     default=1)    # 1=True, 0=False
    updated_at    = Column(DateTime(timezone=True),
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))