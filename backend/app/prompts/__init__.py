import json
from functools import cache
from pathlib import Path

HERE = Path(__file__).parent


@cache
def icons() -> list[dict]:
    return json.loads((HERE / "icons.json").read_text())


@cache
def icon_keys() -> frozenset[str]:
    return frozenset(i["key"] for i in icons())


@cache
def system_prompt() -> str:
    by_provider: dict[str, list[str]] = {}
    for i in icons():
        by_provider.setdefault(i["provider"], []).append(i["key"])
    icon_list = "\n".join(f"- {p}: {', '.join(keys)}" for p, keys in by_provider.items())
    return (HERE / "system.md").read_text().replace("{{ICON_LIST}}", icon_list)


@cache
def few_shot() -> list[tuple[str, str]]:
    """(user, assistant) pairs sent before the real request."""
    return [(e["prompt"], e["dsl"]) for e in json.loads((HERE / "examples.json").read_text())]
