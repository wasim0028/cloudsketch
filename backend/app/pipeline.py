"""prompt -> LLM -> DSL -> parse (one self-correction) -> validate -> log"""

import re
import time
from dataclasses import asdict, dataclass, field

from . import parser_client
from .db import GenerationLog, SessionLocal
from .llm import Message, get_provider
from .prompts import few_shot, system_prompt
from .validate import validate

FENCE = re.compile(r"^```[a-zA-Z]*\n|\n?```\s*$")


@dataclass
class Result:
    ok: bool
    dsl: str
    graph: dict | None
    issues: list[dict] = field(default_factory=list)
    parse_error: dict | None = None
    attempts: int = 0
    provider: str = ""
    model: str = ""
    latency_ms: float = 0
    log_id: int | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def clean(text: str) -> str:
    """Models sometimes add fences or a preamble despite instructions."""
    text = FENCE.sub("", text.strip()).strip()
    return text


def build_messages(prompt: str, current_dsl: str | None) -> list[Message]:
    msgs: list[Message] = []
    for user, assistant in few_shot():
        msgs += [Message("user", user), Message("assistant", assistant)]
    if current_dsl:
        content = (
            f"<current_diagram>\n{current_dsl}\n</current_diagram>\n\n"
            f"<change_request>\n{prompt}\n</change_request>\n\n"
            "Return the full updated DSL. Keep existing names, groups and order unchanged unless the change requires it."
        )
    else:
        content = prompt
    msgs.append(Message("user", content))
    return msgs


def run(prompt: str, current_dsl: str | None = None, provider: str | None = None,
        model: str | None = None, tag: str | None = None) -> Result:
    llm = get_provider(provider, model)
    messages = build_messages(prompt, current_dsl)
    raw_outputs: list[str] = []
    tokens_in = tokens_out = 0
    parse_ok_first = False
    parsed: dict = {}
    dsl = ""
    error: str | None = None
    start = time.perf_counter()

    try:
        for attempt in (1, 2):
            completion = llm.complete(system_prompt(), messages)
            raw_outputs.append(completion.text)
            tokens_in += completion.input_tokens or 0
            tokens_out += completion.output_tokens or 0
            dsl = clean(completion.text)
            parsed = parser_client.parse(dsl)
            if attempt == 1:
                parse_ok_first = parsed["ok"]
            if parsed["ok"]:
                break
            # Self-correction: show the model its own output and the exact error, once
            err = parsed["error"]
            messages += [
                Message("assistant", completion.text),
                Message("user", f"That DSL failed to parse at line {err['line']}, column {err['column']}: "
                                f"{err['message']}\nReturn the full corrected DSL only."),
            ]
    except Exception as e:  # provider/network errors are logged, not hidden
        error = f"{type(e).__name__}: {e}"

    latency = (time.perf_counter() - start) * 1000
    graph, issues = (validate(parsed["graph"]) if parsed.get("ok") else (None, []))
    result = Result(
        ok=bool(parsed.get("ok")), dsl=dsl, graph=graph, issues=issues,
        parse_error=parsed.get("error") or ({"message": error} if error else None),
        attempts=len(raw_outputs), provider=llm.name, model=llm.model, latency_ms=round(latency, 1),
    )

    with SessionLocal() as s:
        log = GenerationLog(
            mode="edit" if current_dsl else "generate", provider=llm.name, model=llm.model,
            prompt=prompt, input_dsl=current_dsl, raw_outputs=raw_outputs, final_dsl=dsl or None,
            parse_ok_first=parse_ok_first, parse_ok_final=result.ok, attempts=result.attempts,
            node_count=len(graph["nodes"]) if graph else 0,
            unknown_icon_count=sum(i["code"] == "unknown_icon" for i in issues),
            issue_count=len(issues), latency_ms=latency,
            input_tokens=tokens_in or None, output_tokens=tokens_out or None, error=error, tag=tag,
        )
        s.add(log)
        s.commit()
        result.log_id = log.id
    return result
