"""Semantic validation after parsing. Never fails: it repairs what it can and
returns a list of issues so the UI can show them and the logs can count them."""

from .prompts import icon_keys

FALLBACK_ICON = "generic-service"


def _issue(code: str, message: str, loc: dict | None = None) -> dict:
    return {"level": "warning", "code": code, "message": message, "line": (loc or {}).get("line")}


def validate(graph: dict) -> tuple[dict, list[dict]]:
    issues: list[dict] = []
    known = icon_keys()
    seen: set[str] = set()
    groups, nodes, edges = [], [], []

    # Groups first so nodes can check that their parent survived
    for g in graph.get("groups", []):
        if g["id"] in seen:
            issues.append(_issue("duplicate_id", f"Duplicate name '{g['id']}' dropped", g.get("loc")))
            continue
        seen.add(g["id"])
        icon = g["attrs"].get("icon")
        if icon and icon not in known:
            issues.append(_issue("unknown_icon", f"Unknown icon '{icon}' on group '{g['id']}' removed", g.get("loc")))
            g = {**g, "attrs": {k: v for k, v in g["attrs"].items() if k != "icon"}}
        groups.append(g)

    for n in graph.get("nodes", []):
        if n["id"] in seen:
            issues.append(_issue("duplicate_id", f"Duplicate name '{n['id']}' dropped", n.get("loc")))
            continue
        seen.add(n["id"])
        icon = n["attrs"].get("icon")
        if icon is None:
            n = {**n, "attrs": {**n["attrs"], "icon": FALLBACK_ICON}}
        elif icon not in known:
            issues.append(_issue("unknown_icon", f"Unknown icon '{icon}' on '{n['id']}', using {FALLBACK_ICON}", n.get("loc")))
            n = {**n, "attrs": {**n["attrs"], "icon": FALLBACK_ICON}}
        nodes.append(n)

    for e in graph.get("edges", []):
        if e["from"] == e["to"]:
            issues.append(_issue("self_loop", f"Self-loop on '{e['from']}' dropped", e.get("loc")))
            continue
        for end in (e["from"], e["to"]):
            if end not in seen:
                seen.add(end)
                nodes.append({"id": end, "attrs": {"icon": FALLBACK_ICON}, "parent": None, "auto": True})
                issues.append(_issue("undeclared_node", f"'{end}' used in an edge but never declared; added it", e.get("loc")))
        edges.append(e)

    return {"groups": groups, "nodes": nodes, "edges": edges}, issues
