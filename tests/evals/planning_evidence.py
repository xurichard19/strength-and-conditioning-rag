"""Screen saved-result prefixes, then verify finalists with live planning_quality runs."""

import argparse
import asyncio
from itertools import product
import json
from pathlib import Path
from time import monotonic

from planning_quality import ROOT, Usage, events, serializable


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--pools", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output exists; choose a fresh path")
    if (args.baseline / "prompts.py").read_text(encoding="utf-8") != (ROOT / "server/app/ai/workflows/plan/prompts.py").read_text(encoding="utf-8"):
        parser.error("prompts changed since baseline")

    from langchain_core.messages import HumanMessage, SystemMessage
    from app.ai.services.search import format_sources_for_prompt, merge_sources
    from app.ai.workflows.plan.models import decision_model
    from app.ai.workflows.plan.prompts import EVALUATE_PROMPT
    from app.ai.workflows.plan.state import EvidenceReview
    from app.config import get_settings
    from app.contracts import Source

    get_settings()
    pools = [row for path in args.pools for row in json.loads(path.read_text(encoding="utf-8"))]
    cases = sorted({row["scenario"] for row in pools})
    args.output.mkdir(parents=True)
    semaphore = asyncio.Semaphore(2)

    async def review(name, research_count, web_count):
        async with semaphore:
            baseline = json.loads((args.baseline / f"{name}.json").read_text(encoding="utf-8"))
            context = next(event["result"]["context_packet"] for event in baseline["events"] if event.get("node") == "context")
            searches = [event["result"]["searches"] for event in baseline["events"] if event.get("node") == "search"][-1]
            # Match the research-first graph: initial research, then both providers on retry.
            selected = [row for row in pools if row["scenario"] == name and
                (row["providers"] == "research" or row["attempt"] > 1)]
            sources = merge_sources([], [Source.model_validate(item) for row in selected
                for item in row["results"][:research_count if row["providers"] == "research" else web_count]])
            warnings = [warning for row in selected for warning in row.get("warnings", [])]
            log = []
            token = events.set(log)
            report = {"scenario": name, "research_count": research_count, "web_count": web_count,
                "evidence_count": len(sources), "evidence_chars": sum(len(source.content) for source in sources),
                "source_ids": [source.document_id or source.url for source in sources]}
            started = monotonic()
            try:
                result = await decision_model(EvidenceReview).with_config(callbacks=[Usage()]).ainvoke([
                    SystemMessage(content=EVALUATE_PROMPT), HumanMessage(content=context),
                    HumanMessage(content=json.dumps({"research_question": searches[0]["query"],
                        "evidence": format_sources_for_prompt(sources), "warnings": warnings,
                        "attempted_queries": searches}, ensure_ascii=False))])
                report["review"] = serializable(result)
            except Exception as error:
                report["error"] = type(error).__name__
            finally:
                report.update(seconds=round(monotonic() - started, 2), events=log)
                events.reset(token)
                (args.output / f"{name}-r{research_count}-w{web_count}.json").write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps({key: value for key, value in report.items() if key not in ("events", "source_ids")}), flush=True)
            return "error" not in report

    results = await asyncio.gather(*(review(name, research, web) for name, research, web in
        product(cases, (5, 10, 15), (3, 5, 10))))
    return all(results)


if __name__ == "__main__":
    try:
        raise SystemExit(0 if asyncio.run(main()) else 1)
    except Exception as error:
        print(json.dumps({"evidence_audit_error": type(error).__name__}), flush=True)
        raise SystemExit(1)
