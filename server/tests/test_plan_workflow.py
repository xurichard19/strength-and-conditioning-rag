import asyncio
from datetime import timedelta
import json
from time import monotonic
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID

from langchain_core.messages import AIMessage
from openai import LengthFinishReasonError

from app.ai.services.search import SearchResponse
from app.ai.workflows.plan import graph
from app.ai.workflows.plan.nodes.evaluate import evaluate_node
from app.ai.workflows.plan.nodes.generate import generate_node
from app.ai.workflows.plan.state import EvidenceReview, SearchQuery
from app.contracts import OnboardingResponseRecord, PlanningProposal, Source, SportsWorkoutRecord
from server.tests.test_planning_validation import DAY, END, NOW, OWNER, WORKOUT_ID, inputs, prescription, proposal, record


QUERY = SearchQuery(query="strength training around soccer recovery", providers="research")
SOURCE = Source(source_type="research", document_id="study", content="Allow recovery between taxing sessions.")


def response(value, finish_reason="stop"):
    return {"raw": AIMessage(content="", response_metadata={"finish_reason": finish_reason}),
        "parsed": value, "parsing_error": None}


def review(sufficient=True, query=None):
    return EvidenceReview(sufficient=sufficient, gap="" if sufficient else "recovery evidence missing", next_search=query)


class PlanWorkflowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict("os.environ", {"LANGSMITH_TRACING": "false", "LANGCHAIN_TRACING_V2": "false"}))
        self.claim, self.context = inputs("refresh")
        self.preparer = AsyncMock(return_value=QUERY)
        self.evaluator = AsyncMock(return_value=review())
        self.generator = AsyncMock(return_value=response(proposal([prescription()], active_days=[DAY])))
        self.search = self.enterContext(patch("app.ai.workflows.plan.nodes.search.search_sources",
            new=AsyncMock(return_value=SearchResponse(results=[SOURCE]))))
        for module, name, mock in (("prepare", "decision_model", self.preparer),
                ("evaluate", "decision_model", self.evaluator), ("generate", "generation_model", self.generator)):
            self.enterContext(patch(f"app.ai.workflows.plan.nodes.{module}.{name}",
                return_value=SimpleNamespace(ainvoke=mock)))

    async def run_plan(self):
        return await graph.generate_plan(self.claim, self.context)

    async def test_initial_21_day_sample_uses_real_graph_and_validation(self):
        self.context.schedule.horizon_end = None
        self.context.onboarding = OnboardingResponseRecord(user_id=OWNER,
            answers={"goals": "soccer strength", "equipment": ["dumbbells"]}, created_at=NOW, updated_at=NOW)
        result = await self.run_plan()
        self.assertEqual(len(result.day_decisions), 21)
        self.assertEqual(len(result.workouts), 1)
        self.assertEqual(result.before_ids, [])
        self.search.assert_awaited_once_with(QUERY.query, providers="research", top_k=5)
        self.evaluator.assert_awaited_once()
        self.generator.assert_awaited_once()
        packet = json.loads(self.generator.call_args.args[0][1].content)
        self.assertEqual(packet["task"]["kind"], "first_fill")
        self.assertEqual(packet["task"]["effective_through"], str(END))
        self.assertEqual(packet["onboarding"]["goals"], "soccer strength")

    async def test_first_search_uses_research_even_when_preparer_selects_web(self):
        self.preparer.return_value = QUERY.model_copy(update={"providers": "web"})
        await self.run_plan()
        self.search.assert_awaited_once_with(QUERY.query, providers="research", top_k=5)

    async def test_failed_structured_decision_never_starts_research_or_generation(self):
        self.preparer.side_effect = LengthFinishReasonError(completion=SimpleNamespace(usage=None))
        with self.assertRaises(LengthFinishReasonError):
            await self.run_plan()
        self.search.assert_not_awaited()
        self.evaluator.assert_not_awaited()
        self.generator.assert_not_awaited()

    async def test_weekly_extension_preserves_overlap_in_context(self):
        self.context.schedule.horizon_end = DAY + timedelta(days=13)
        self.context.calendar.workouts = [record()]
        self.claim.effective_from = DAY + timedelta(days=14)
        candidate = proposal([prescription(self.claim.effective_from)], active_days=[self.claim.effective_from])
        candidate.day_decisions = candidate.day_decisions[14:]
        self.generator.return_value = response(candidate)
        result = await self.run_plan()
        self.assertEqual(len(result.day_decisions), 7)
        packet = json.loads(self.generator.call_args.args[0][1].content)
        self.assertEqual(packet["task"]["kind"], "extension")
        self.assertEqual(packet["editable_workout_ids"], [])
        self.assertEqual(packet["calendar"]["workouts"][0]["id"], str(WORKOUT_ID))

    async def test_sport_change_adjusts_exact_workout_and_preserves_protected_results(self):
        protected = record(prescription(DAY + timedelta(days=1)), UUID(int=8))
        protected.exercises[0].sets[0].actual_reps = 0
        sport = SportsWorkoutRecord(id=UUID(int=9), user_id=OWNER, sport="soccer", scheduled_date=DAY,
            intensity="hard", created_at=NOW, updated_at=NOW)
        self.claim, self.context = inputs(workouts=[record(), protected], sports=[sport])
        self.claim.job.reason = "sport commitment changed"
        replacement = prescription()
        replacement.exercises[0].sets[0].planned_reps = 3
        self.generator.return_value = response(proposal([replacement], [WORKOUT_ID], [DAY, DAY + timedelta(days=1)]))
        result = await self.run_plan()
        self.assertEqual(result.before_ids, [WORKOUT_ID])
        packet = json.loads(self.generator.call_args.args[0][1].content)
        self.assertEqual(packet["editable_workout_ids"], [str(WORKOUT_ID)])
        self.assertEqual(packet["calendar"]["sports_workouts"][0]["intensity"], "hard")
        self.assertEqual(packet["calendar"]["workouts"][1]["exercises"][0]["sets"][0]["actual_reps"], 0)

    async def test_context_omits_identity_and_lease_but_keeps_recent_results(self):
        self.context.profile.email = "private@example.invalid"
        historical = record(prescription(DAY - timedelta(days=2)))
        historical.exercises[0].sets[0].actual_reps = 4
        self.context.recent_workouts = [historical]
        await self.run_plan()
        for mock in (self.preparer, self.evaluator, self.generator):
            text = str(mock.call_args.args[0])
            for secret in (str(OWNER), str(self.claim.job.lease_token), "private@example.invalid", "created_by_change_id"):
                self.assertNotIn(secret, text)
            if mock is not self.evaluator:
                self.assertIn("actual_reps", text)

    async def test_evidence_review_gets_question_and_sources_without_calendar_details(self):
        self.context.calendar.workouts = [record(prescription(DAY - timedelta(days=1)))]
        await self.run_plan()
        messages = self.evaluator.call_args.args[0]
        self.assertEqual(len(messages), 2)
        packet = json.loads(messages[1].content)
        self.assertEqual(packet["research_question"], QUERY.query)
        self.assertEqual(packet["attempted_queries"], [QUERY.model_dump()])
        self.assertIn(SOURCE.content, packet["evidence"])
        for private_detail in (str(WORKOUT_ID), "planned_reps", "editable_workout_ids", "calendar"):
            self.assertNotIn(private_detail, messages[1].content)
        self.assertIn("planned_reps", self.generator.call_args.args[0][1].content)

    async def test_stale_foreign_and_missing_claim_date_fail_before_model_calls(self):
        original = self.context.model_copy(deep=True)
        for invalid in ("revision", "owner", "claimed_on"):
            with self.subTest(invalid=invalid):
                self.context = original.model_copy(deep=True)
                if invalid == "revision":
                    self.context.schedule.revision += 1
                elif invalid == "owner":
                    self.context.profile.id = UUID(int=999)
                else:
                    self.claim.job.claimed_on = None
                with self.assertRaises(ValueError):
                    await self.run_plan()
                self.preparer.assert_not_awaited()
                self.search.assert_not_awaited()

    async def test_context_size_limit_fails_without_truncating_data_or_calling_models(self):
        with patch("app.ai.workflows.plan.nodes.context.MAX_CONTEXT_CHARS", 10), self.assertRaisesRegex(ValueError, "bounded input"):
            await self.run_plan()
        self.preparer.assert_not_awaited()

    async def test_covered_refresh_skips_all_models(self):
        self.context.schedule.horizon_end = END
        self.claim.effective_from = END + timedelta(days=1)
        result = await self.run_plan()
        self.assertEqual(result, PlanningProposal(before_ids=[], workouts=[], day_decisions=[]))
        self.preparer.assert_not_awaited()
        self.search.assert_not_awaited()

    async def test_retry_requires_new_provider_pair_and_reviews_second_results(self):
        self.evaluator.side_effect = [review(False, QUERY.model_copy(update={"providers": "both"})), review()]
        await self.run_plan()
        self.assertEqual(self.search.await_count, 2)
        self.assertEqual(self.search.call_args.kwargs["providers"], "web")
        self.assertEqual(self.evaluator.await_count, 2)
        self.generator.assert_awaited_once()
        packet = json.loads(self.generator.call_args.args[0][-1].content)
        self.assertEqual(packet["evidence"].count(SOURCE.content), 1)

    async def test_novel_retry_widens_to_web_even_when_reviewer_selects_only_research(self):
        next_query = SearchQuery(query="soccer concurrent training professional guideline", providers="research")
        self.evaluator.side_effect = [review(False, next_query), review()]
        await self.run_plan()
        self.assertEqual(self.search.await_count, 2)
        self.search.assert_awaited_with(next_query.query, providers="both", top_k=5)
        self.generator.assert_awaited_once()

    async def test_insufficient_after_one_retry_never_generates(self):
        self.evaluator.return_value = review(False, SearchQuery(query="different recovery evidence", providers="research"))
        with self.assertRaisesRegex(RuntimeError, "insufficient"):
            await self.run_plan()
        self.assertEqual(self.search.await_count, 2)
        self.generator.assert_not_awaited()

    async def test_repeated_query_casing_and_punctuation_do_not_allow_retry(self):
        self.evaluator.return_value = review(False, QUERY.model_copy(update={"query": QUERY.query.upper() + "?!"}))
        state = {"research_deadline": monotonic() + 60, "sources": [SOURCE], "warnings": [],
            "searches": [QUERY.model_copy(update={"providers": "both"})], "retries_left": 1}
        with self.assertRaisesRegex(RuntimeError, "no new research"):
            await evaluate_node(state)
        self.search.assert_not_awaited()
        self.generator.assert_not_awaited()

    async def test_empty_evidence_or_failed_review_never_authorizes_generation(self):
        self.search.return_value = SearchResponse(warnings=["research unavailable"])
        with self.assertRaisesRegex(RuntimeError, "insufficient"):
            await self.run_plan()
        self.evaluator.side_effect = TimeoutError()
        with self.assertRaises(TimeoutError):
            await self.run_plan()
        self.generator.assert_not_awaited()

    async def test_partial_provider_failure_allows_relevant_remaining_evidence(self):
        self.search.return_value = SearchResponse(results=[SOURCE], warnings=["web unavailable"])
        await self.run_plan()
        self.assertIn("web unavailable", str(self.evaluator.call_args.args[0]))
        self.generator.assert_awaited_once()

    async def test_invalid_schema_and_invalid_coverage_each_get_one_repair(self):
        good = self.generator.return_value
        for candidate in (None, proposal([prescription()])):
            with self.subTest(candidate=candidate):
                self.generator.reset_mock()
                self.generator.side_effect = [response(candidate), good]
                result = await self.run_plan()
                self.assertEqual(len(result.workouts), 1)
                self.assertEqual(self.generator.await_count, 2)
                feedback = json.loads(self.generator.call_args.args[0][-1].content)
                self.assertTrue(feedback["validation_issue"])
                self.assertEqual(self.generator.call_args_list[0].args[0][1].content,
                    self.generator.call_args_list[1].args[0][1].content)

    async def test_repeated_invalid_output_fails_after_one_repair(self):
        self.generator.return_value = response(proposal([prescription()]))
        with self.assertRaisesRegex(ValueError, "repair budget"):
            await self.run_plan()
        self.assertEqual(self.generator.await_count, 2)

    async def test_truncated_output_is_never_published(self):
        self.generator.return_value = response(proposal(), "length")
        with self.assertRaisesRegex(ValueError, "did not complete"):
            await self.run_plan()
        self.generator.assert_awaited_once()

    async def test_research_retry_preserves_generation_budget(self):
        self.evaluator.return_value = review(False, SearchQuery(query="new query", providers="research"))
        state = {"research_deadline": monotonic() + 40, "sources": [SOURCE], "warnings": [],
            "searches": [QUERY], "context_packet": "{}", "retries_left": 1}
        with self.assertRaisesRegex(TimeoutError, "generation budget"):
            await evaluate_node(state)

    async def test_generation_checks_remaining_time_before_calling_provider(self):
        with self.assertRaisesRegex(TimeoutError, "generation budget"):
            await generate_node({"deadline": monotonic() + 1})
        self.generator.assert_not_awaited()

    async def test_deadline_cancels_stalled_graph(self):
        cancelled = asyncio.Event()
        async def stalled(*args, **kwargs):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with patch.object(graph, "PLAN_TIMEOUT_SECONDS", 0.01), patch.object(graph, "build_plan_workflow",
                return_value=SimpleNamespace(ainvoke=stalled)), self.assertRaises(TimeoutError):
            await self.run_plan()
        self.assertTrue(cancelled.is_set())

    async def test_cancellation_propagates_without_retrying(self):
        self.generator.side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await self.run_plan()
        self.generator.assert_awaited_once()

    def test_compilation_is_cached_without_checkpoint_state(self):
        self.assertIs(graph.build_plan_workflow(), graph.build_plan_workflow())
        self.assertIsNone(graph.build_plan_workflow().checkpointer)
