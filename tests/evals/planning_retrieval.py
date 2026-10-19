"""Opt-in live retrieval comparison using synthetic queries and production search."""

import argparse
import asyncio
import json
from itertools import product
import logging
import os
from pathlib import Path
import sys
from time import monotonic


QUERIES = (
    "Novice resistance training progression frequency sets repetitions intensity full-body training guidelines",
    "Acute fatigue recovery between lower-body resistance training and high-intensity running sessions",
    "Resistance training autoregulation repetitions in reserve RPE load adjustment fatigue missed repetitions",
)


async def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=root / ".planning-eval.local" / "retrieval.json")
    parser.add_argument("--top-k", type=int, choices=(5, 10, 15), default=5)
    parser.add_argument("--web-count", type=int, choices=(3, 5, 10), default=5)
    parser.add_argument("--providers", choices=("research", "web", "both"), default="research")
    parser.add_argument("--queries-from", type=Path, help="Reuse actual queries from a saved planning run.")
    parser.add_argument("--cases", nargs="*")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output exists; choose a fresh path")
    os.environ.update(LANGSMITH_TRACING="false", LANGCHAIN_TRACING_V2="false", LANGCHAIN_TRACING="false")
    logging.disable(logging.CRITICAL)
    sys.path.insert(0, str(root / "server"))
    from app.ai.services.search import search_sources

    queries = [{"query": query} for query in QUERIES]
    if args.queries_from:
        queries = []
        for path in sorted(args.queries_from.glob("*.json")):
            report = json.loads(path.read_text(encoding="utf-8"))
            if not report.get("scenario") or args.cases and report["scenario"] not in args.cases:
                continue
            for event in report["events"]:
                if event.get("node") == "search" and "result" in event:
                    queries.append({"scenario": report["scenario"],
                        "attempt": len(event["result"]["searches"]),
                        "query": event["result"]["searches"][-1]["query"]})
    if not queries:
        parser.error("no saved queries found")
    reports = []
    providers = ("research", "web") if args.providers == "both" else (args.providers,)
    for item, provider in product(queries, providers):
        started = monotonic()
        count = args.top_k if provider == "research" else args.web_count
        report = {**item, "providers": provider, "top_k": count, "results": []}
        try:
            response = await search_sources(item["query"], providers=provider, top_k=count)
            report.update(response.model_dump(mode="json"))
        except Exception as error:
            report["error"] = type(error).__name__
        report["seconds"] = round(monotonic() - started, 2)
        reports.append(report)
        print(json.dumps({**item, "provider": provider, "count": len(report["results"]), "seconds": report["seconds"]}), flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    return all(report["results"] for report in reports)


if __name__ == "__main__":
    try:
        if not asyncio.run(main()):
            sys.exit(1)
    except Exception as error:
        print(json.dumps({"retrieval_error": type(error).__name__}), flush=True)
        sys.exit(1)
