from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import parser_client, pipeline
from .config import settings
from .db import Diagram, GenerationLog, SessionLocal, init_db
from .llm import PROVIDERS
from .prompts import icons
from .validate import validate

app = FastAPI(title="Cloudsketch (research prototype)")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_methods=["*"], allow_headers=["*"]
)


@app.on_event("startup")
def startup() -> None:
    init_db()


def db():
    with SessionLocal() as s:
        yield s


class GenerateIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    provider: str | None = None
    model: str | None = None


class EditIn(GenerateIn):
    dsl: str


class ValidateIn(BaseModel):
    dsl: str


class DiagramIn(BaseModel):
    title: str = "Untitled diagram"
    prompt: str | None = None
    dsl: str
    positions: dict | None = None


@app.get("/api/health")
def health():
    return {"ok": True, "provider": settings.llm_provider}


@app.get("/api/config")
def config():
    return {"providers": list(PROVIDERS), "default_provider": settings.llm_provider, "default_model": settings.llm_model}


@app.get("/api/icons")
def list_icons():
    return icons()


@app.post("/api/generate")
def generate(body: GenerateIn, tag: str | None = None):
    """`tag` (query param) groups log rows, e.g. an eval run id."""
    return _run(body.prompt, None, body.provider, body.model, tag)


@app.post("/api/edit")
def edit(body: EditIn, tag: str | None = None):
    return _run(body.prompt, body.dsl, body.provider, body.model, tag)


def _run(prompt, dsl, provider, model, tag=None):
    try:
        return pipeline.run(prompt, dsl, provider, model, tag).to_dict()
    except ValueError as e:
        raise HTTPException(400, str(e))
    except parser_client.ParserUnavailable as e:
        raise HTTPException(503, str(e))


@app.post("/api/validate")
def validate_dsl(body: ValidateIn):
    """Server-side parse + validate (the editor also parses in the browser for instant feedback)."""
    parsed = parser_client.parse(body.dsl)
    if not parsed["ok"]:
        return {"ok": False, "parse_error": parsed["error"], "graph": None, "issues": []}
    graph, issues = validate(parsed["graph"])
    return {"ok": True, "graph": graph, "issues": issues, "parse_error": None}


# ---------- Saved diagrams ----------
@app.get("/api/diagrams")
def list_diagrams(s: Session = Depends(db)):
    rows = s.scalars(select(Diagram).order_by(Diagram.updated_at.desc())).all()
    return [{"id": d.id, "title": d.title, "updated_at": d.updated_at} for d in rows]


@app.get("/api/diagrams/{diagram_id}")
def get_diagram(diagram_id: int, s: Session = Depends(db)):
    d = s.get(Diagram, diagram_id) or _404()
    return {"id": d.id, "title": d.title, "prompt": d.prompt, "dsl": d.dsl, "positions": d.positions}


@app.post("/api/diagrams")
def create_diagram(body: DiagramIn, s: Session = Depends(db)):
    d = Diagram(**body.model_dump())
    s.add(d)
    s.commit()
    return {"id": d.id}


@app.put("/api/diagrams/{diagram_id}")
def update_diagram(diagram_id: int, body: DiagramIn, s: Session = Depends(db)):
    d = s.get(Diagram, diagram_id) or _404()
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    s.commit()
    return {"id": d.id}


@app.delete("/api/diagrams/{diagram_id}")
def delete_diagram(diagram_id: int, s: Session = Depends(db)):
    d = s.get(Diagram, diagram_id) or _404()
    s.delete(d)
    s.commit()
    return {"ok": True}


# ---------- Research logs ----------
@app.get("/api/logs")
def logs(limit: int = 50, tag: str | None = None, s: Session = Depends(db)):
    q = select(GenerationLog).order_by(GenerationLog.id.desc()).limit(min(limit, 500))
    if tag:
        q = q.where(GenerationLog.tag == tag)
    cols = ["id", "created_at", "mode", "provider", "model", "prompt", "parse_ok_first", "parse_ok_final",
            "attempts", "node_count", "unknown_icon_count", "issue_count", "latency_ms", "error", "tag"]
    return [{c: getattr(r, c) for c in cols} for r in s.scalars(q)]


def _404():
    raise HTTPException(404, "Not found")
