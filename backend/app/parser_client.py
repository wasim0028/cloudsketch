"""Calls the Node parser sidecar so the backend uses the exact same grammar as the browser."""

import httpx

from .config import settings


class ParserUnavailable(RuntimeError):
    pass


def parse(dsl: str) -> dict:
    """Returns {"ok": True, "graph": {...}} or {"ok": False, "error": {message, line, column}}."""
    try:
        r = httpx.post(f"{settings.parser_url}/parse", json={"dsl": dsl}, timeout=10)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise ParserUnavailable(f"Parser sidecar unreachable at {settings.parser_url}: {e}") from e
