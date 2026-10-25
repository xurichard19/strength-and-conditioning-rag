"""Opt-in live planning audit: synthetic athletes, real providers, no database writes."""

import argparse
import asyncio
from contextvars import ContextVar
from functools import wraps
from hashlib import sha256
from importlib.metadata import version
import json
import logging
import os
from pathlib import Path
import sys
from time import monotonic

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "server"), str(Path(__file__).parent)]
os.environ.update(LANGSMITH_TRACING="false", LANGCHAIN_TRACING_V2="false", LANGCHAIN_TRACING="false")
logging.disable(logging.CRITICAL)

from langchain_core.callbacks import BaseCallbackHandler
from pydantic import BaseModel

from planning_scenarios import SCENARIO_EXPECTATIONS, scenarios


events = ContextVar("planning_audit_events")


def serializable(value):
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {key: serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    return value


class Usage(BaseCallbackHandler):
    def on_llm_end(self, response, **kwargs):
        for group in response.generations:
            for result in group:
                message = getattr(result, "message", None)
                if message is not None:
                    events.get().append({"model": message.response_metadata.get("model_name"),
                        "usage": message.usage_metadata, "response": message.content})


def instrument():
    """Observe the production graph and model calls without replacing their behavior."""
    from app.ai.services import search
    from app.ai.workflows.plan import graph
    from app.ai.workflows.plan.nodes import evaluate, generate, prepare

    for name in ("context", "prepare", "search", "evaluate", "generate", "validate"):
        original = getattr(graph, f"{name}_node")

        def observer(node, label):
            @wraps(node)
            async def run(*args, **kwargs):
                started = monotonic()
                try:
                    result = await node(*args, **kwargs)
                except Exception as error:
                    events.get().append({"node": label, "seconds": round(monotonic() - started, 2),
                        "error": type(error).__name__, "status": getattr(error, "status_code", None)})
                    raise
                events.get().append({"node": label, "seconds": round(monotonic() - started, 2),
                    "result": serializable(result)})
                return result
            return run

        setattr(graph, f"{name}_node", observer(original, name))
    for module, name in ((prepare, "decision_model"), (evaluate, "decision_model"), (generate, "generation_model")):
        factory = getattr(module, name)
        setattr(module, name, lambda *args, factory=factory: factory(*args).with_config(callbacks=[Usage()]))
    for name, provider in (("hybrid_search_research_docs", "research"), ("web_search", "web")):
        original = getattr(search, name)

        def observe_provider(operation, label):
            @wraps(operation)
            async def run(query, top_k):
                started = monotonic()
                try:
                    result = await operation(query, top_k)
                except Exception as error:
                    events.get().append({"provider": label, "seconds": round(monotonic() - started, 2),
                        "error": type(error).__name__})
                    raise
                events.get().append({"provider": label, "seconds": round(monotonic() - started, 2),
                    "results": len(result)})
                return result
            return run

        setattr(search, name, observe_provider(original, provider))
    graph.build_plan_workflow.cache_clear()
    return graph.generate_plan


def summarize(claim, context, proposal):
    kept = [item for item in context.calendar.workouts if item.id not in proposal.before_ids]
    workouts = [*kept, *proposal.workouts]
    availability = (context.onboarding.answers if context.onboarding else {}).get("trainingDays", [])
    return {"replaced": len(proposal.before_ids), "added": len(proposal.workouts),
        "outside_availability": [str(w.scheduled_date) for w in proposal.workouts
            if availability and w.scheduled_date.strftime("%a") not in availability],
        "sport_collisions": [{"date": str(w.scheduled_date), "workout": w.name, "sport": s.sport, "intensity": s.intensity}
            for w in workouts for s in context.calendar.sports_workouts
            if w.scheduled_date == s.scheduled_date and s.status != "cancelled"],
        "workouts": [{"date": str(w.scheduled_date), "name": w.name, "exercises": [e.name for e in w.exercises],
            "sets": sum(len(e.sets) for e in w.exercises),
            "rest_minutes": round(sum(s.planned_rest_seconds or 0 for e in w.exercises for s in e.sets) / 60, 1),
            "notes": w.notes} for w in sorted(workouts, key=lambda item: item.scheduled_date)]}


async def run_case(name, inputs, output, semaphore, generate_plan, limits):
    async with semaphore:
        claim, context = inputs
        log = []
        token = events.set(log)
        started = monotonic()
        report = {"scenario": name, "limits": limits, "expectation": SCENARIO_EXPECTATIONS[name],
            "claim": serializable(claim), "context": serializable(context)}
        print(json.dumps({"scenario": name, "status": "started"}), flush=True)
        try:
            proposal = await generate_plan(claim, context)
            report.update(status="passed_contract_validation", proposal=serializable(proposal),
                summary=summarize(claim, context, proposal))
        except Exception as error:
            # Provider error text can include authentication details; retain only safe diagnostics.
            report.update(status="failed", error=type(error).__name__, http_status=getattr(error, "status_code", None))
        finally:
            report.update(seconds=round(monotonic() - started, 2), events=log)
            # Failed calls may omit usage; these totals are reported tokens, not a billing estimate.
            usages = [event["usage"] for event in log if event.get("usage")]
            reviews = []
            for event in log:
                try:
                    decision = json.loads(event.get("response", ""))
                except (ValueError, TypeError):
                    continue
                if isinstance(decision, dict) and "sufficient" in decision:
                    reviews.append(decision)
            report["evidence_reviews"] = reviews
            searches = [event["result"] for event in log if event.get("node") == "search" and "result" in event]
            sources = searches[-1]["sources"] if searches else []
            report["metrics"] = {"model_calls": len(usages), "search_rounds": len(searches),
                "generation_calls": sum(event.get("node") == "generate" for event in log),
                "repairs": sum(bool(event.get("result", {}).get("retry_generation")) for event in log
                    if event.get("node") == "validate"),
                "input_tokens": sum(item.get("input_tokens", 0) for item in usages),
                "output_tokens": sum(item.get("output_tokens", 0) for item in usages),
                "evidence_count": len(sources), "evidence_chars": sum(len(item["content"]) for item in sources),
                "research_papers": len({item.get("document_id") or item.get("doi") or item.get("chunk_id")
                    for item in sources if item["source_type"] == "research"}),
                "sources_by_provider": {provider: sum(item["source_type"] == provider for item in sources)
                    for provider in ("research", "web")},
                "provider_seconds": {provider: round(sum(event["seconds"] for event in log
                    if event.get("provider") == provider), 2) for provider in ("research", "web")}}
            events.reset(token)
            (output / f"{name}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({key: report[key] for key in ("scenario", "status", "seconds")}), flush=True)
        return report["status"] != "failed"


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", nargs="*")
    parser.add_argument("--output", type=Path, default=ROOT / ".planning-eval.local" / "run")
    parser.add_argument("--concurrency", type=int, choices=(1, 2), default=2)
    parser.add_argument("--research-count", type=int, choices=(5, 10, 15))
    parser.add_argument("--web-count", type=int, choices=(3, 5, 10))
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    cases = scenarios()
    if args.list:
        print("\n".join(cases))
        return
    if args.cases:
        if unknown := set(args.cases) - cases.keys():
            parser.error(f"unknown scenarios: {', '.join(sorted(unknown))}")
        cases = {name: cases[name] for name in args.cases}
    from app.config import get_settings
    from app.ai.workflows.plan.state import RESULTS_PER_PROVIDER

    get_settings()  # Load configured providers internally; never print credentials or settings.
    limits = {"research": args.research_count or RESULTS_PER_PROVIDER["research"],
        "web": args.web_count or RESULTS_PER_PROVIDER["web"]}
    RESULTS_PER_PROVIDER.update(limits)
    args.output.mkdir(parents=True, exist_ok=True)
    if any((args.output / f"{name}.json").exists() for name in cases):
        parser.error("output already contains these cases; choose a fresh directory")
    (args.output / "prompts.py").write_text((ROOT / "server/app/ai/workflows/plan/prompts.py").read_text(encoding="utf-8"), encoding="utf-8")
    configuration = {"limits": limits, "concurrency": args.concurrency,
        "versions": {name: version(name) for name in ("langgraph", "langchain-openai", "chromadb", "langchain-tavily")},
        "sha256": {path: sha256((ROOT / path).read_bytes()).hexdigest() for path in (
            "server/app/ai/workflows/plan/prompts.py", "server/app/ai/workflows/plan/models.py",
            "server/app/ai/workflows/plan/nodes/prepare.py", "server/app/ai/workflows/plan/nodes/evaluate.py",
            "server/app/ai/workflows/plan/nodes/search.py", "server/app/ai/services/search.py",
            "server/app/ai/workflows/plan/nodes/generate.py", "server/app/ai/workflows/plan/nodes/validate.py",
            "server/app/ai/workflows/plan/nodes/context.py", "server/app/ai/workflows/plan/state.py",
            "server/app/services/planning.py",
            "tests/evals/planning_scenarios.py")}}
    (args.output / "configuration.json").write_text(json.dumps(configuration, indent=2), encoding="utf-8")
    generate_plan = instrument()
    semaphore = asyncio.Semaphore(args.concurrency)
    results = await asyncio.gather(*(run_case(name, inputs, args.output, semaphore, generate_plan, limits)
        for name, inputs in cases.items()))
    return all(results)


if __name__ == "__main__":
    try:
        if asyncio.run(main()) is False:
            sys.exit(1)
    except Exception as error:
        print(json.dumps({"audit_error": type(error).__name__}), flush=True)
        sys.exit(1)
