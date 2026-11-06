#!/usr/bin/env python3
"""Run the eval prompt set through the backend and report quality metrics.

Usage:
  python eval/run_eval.py                                   # default provider
  python eval/run_eval.py --provider ollama --model qwen2.5-coder:7b
  python eval/run_eval.py --provider claude --model claude-sonnet-5-5 --api http://localhost:8000

Metrics:
  parse success (first try)   - DSL parsed without the self-correction pass
  parse success (final)       - parsed after at most one correction
  unknown-icon rate           - unknown icons / total nodes (icons the model invented)
  expected-icon recall        - share of the prompt's expected icon keys present
  average latency             - wall-clock per request, including any retry

Every call is also logged in Postgres (generation_logs) with tag=<run id>, so you
can slice runs later with SQL or GET /api/logs?tag=<run id>.
"""

import argparse
import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

HERE = Path(__file__).parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--provider")
    ap.add_argument("--model")
    ap.add_argument("--only", help="comma-separated prompt ids")
    args = ap.parse_args()

    prompts = json.loads((HERE / "prompts.json").read_text())
    if args.only:
        keep = set(args.only.split(","))
        prompts = [p for p in prompts if p["id"] in keep]

    run_id = f"eval-{datetime.now():%Y%m%d-%H%M%S}"
    rows = []
    print(f"run {run_id}: {len(prompts)} prompts via {args.provider or 'default provider'}\n")
    print(f"{'id':22} {'1st':>4} {'final':>5} {'nodes':>5} {'unk':>4} {'recall':>6} {'ms':>7}")

    with httpx.Client(timeout=300) as client:
        for p in prompts:
            t = time.perf_counter()
            try:
                r = client.post(f"{args.api}/api/generate", params={"tag": run_id},
                                json={"prompt": p["prompt"], "provider": args.provider, "model": args.model})
                r.raise_for_status()
                res = r.json()
            except httpx.HTTPError as e:
                print(f"{p['id']:22} request failed: {e}")
                rows.append({"id": p["id"], "failed": True, "latency_ms": (time.perf_counter() - t) * 1000})
                continue

            nodes = (res.get("graph") or {}).get("nodes", [])
            unknown = sum(i["code"] == "unknown_icon" for i in res.get("issues", []))
            present = {n["attrs"].get("icon") for n in nodes} | {
                g["attrs"].get("icon") for g in (res.get("graph") or {}).get("groups", [])
            }
            recall = (sum(k in present for k in p["expect"]) / len(p["expect"])) if p["expect"] else None
            row = {
                "id": p["id"],
                "parse_first": res["attempts"] == 1 and res["ok"],
                "parse_final": res["ok"],
                "nodes": len(nodes),
                "unknown_icons": unknown,
                "recall": recall,
                "latency_ms": res["latency_ms"],
            }
            rows.append(row)
            print(f"{p['id']:22} {'✓' if row['parse_first'] else '✗':>4} {'✓' if row['parse_final'] else '✗':>5} "
                  f"{row['nodes']:>5} {unknown:>4} {'' if recall is None else f'{recall:.0%}':>6} {row['latency_ms']:>7.0f}")

    ok = [r for r in rows if not r.get("failed")]
    total_nodes = sum(r["nodes"] for r in ok) or 1
    recalls = [r["recall"] for r in ok if r["recall"] is not None]
    summary = {
        "run_id": run_id,
        "provider": args.provider or "default",
        "model": args.model or "default",
        "prompts": len(rows),
        "request_failures": len(rows) - len(ok),
        "parse_success_first": _pct(sum(r["parse_first"] for r in ok), len(rows)),
        "parse_success_final": _pct(sum(r["parse_final"] for r in ok), len(rows)),
        "unknown_icon_rate": _pct(sum(r["unknown_icons"] for r in ok), total_nodes),
        "expected_icon_recall": _pct(sum(recalls), len(recalls)) if recalls else None,
        "avg_latency_ms": round(statistics.mean(r["latency_ms"] for r in rows), 1) if rows else None,
        "p50_latency_ms": round(statistics.median(r["latency_ms"] for r in rows), 1) if rows else None,
    }
    print("\n" + "\n".join(f"{k:22} {v}" for k, v in summary.items()))

    out = HERE / "results" / f"{run_id}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "rows": rows}, indent=2))
    print(f"\nsaved {out.relative_to(HERE.parent)}")
    return 0


def _pct(n: float, d: int) -> str:
    return f"{(n / d if d else 0):.1%}"


if __name__ == "__main__":
    sys.exit(main())
