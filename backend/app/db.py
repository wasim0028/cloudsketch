from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Diagram(Base):
    __tablename__ = "diagrams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str | None] = mapped_column(Text)
    dsl: Mapped[str] = mapped_column(Text)
    # node id -> {x, y}; lets edits keep positions stable after reload
    positions: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class GenerationLog(Base):
    """One row per /generate or /edit call - the raw material for research comparisons."""

    __tablename__ = "generation_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    mode: Mapped[str] = mapped_column(String(10))  # generate | edit
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(100))
    prompt: Mapped[str] = mapped_column(Text)
    input_dsl: Mapped[str | None] = mapped_column(Text)  # edit mode only
    raw_outputs: Mapped[list] = mapped_column(JSON)  # every LLM response, incl. retry
    final_dsl: Mapped[str | None] = mapped_column(Text)
    parse_ok_first: Mapped[bool] = mapped_column(Boolean)
    parse_ok_final: Mapped[bool] = mapped_column(Boolean)
    attempts: Mapped[int] = mapped_column(Integer)
    node_count: Mapped[int] = mapped_column(Integer, default=0)
    unknown_icon_count: Mapped[int] = mapped_column(Integer, default=0)
    issue_count: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[float] = mapped_column(Float)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    tag: Mapped[str | None] = mapped_column(String(100))  # e.g. eval run id


def init_db() -> None:
    Base.metadata.create_all(engine)
