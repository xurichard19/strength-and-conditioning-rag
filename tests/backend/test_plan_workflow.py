import asyncio
from datetime import timedelta
import json
from time import monotonic
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, call, patch
from uuid import UUID

from langchain_core.messages import AIMessage
from openai import LengthFinishReasonError

from app.ai.services.search import SearchResponse
from app.ai.workflows.plan import graph
from app.ai.workflows.plan.nodes.evaluate import evaluate_node
from app.ai.workflows.plan.nodes.generate import generate_node
from app.ai.workflows.plan.nodes.search import search_node
from app.ai.workflows.plan.nodes.validate import validate_node
from app.ai.workflows.plan.state import EvidenceReview, SearchQuery
from app.contracts import OnboardingResponseRecord, PlanningProposal, Source, SportsWorkoutRecord
from tests.backend.test_planning_validation import (
    DAY, END, NOW, OWNER, WORKOUT_ID, inputs, invalid_prescriptions, prescription, proposal, record,
)


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
        self.search.assert_awaited_once_with(QUERY.query, providers="research", top_k=10)
        self.evaluator.assert_awaited_once()
        self.generator.assert_awaited_once()
        packet = json.loads(self.generator.call_args.args[0][1].content)
        self.assertEqual(packet["task"]["kind"], "first_fill")
        self.assertEqual(packet["task"]["effective_through"], str(END))
        self.assertEqual(packet["onboarding"]["goals"], "soccer strength")

    async def test_first_search_honors_selected_providers_and_their_limits(self):
        for selected in ("research", "web", "both"):
            with self.subTest(providers=selected):
                self.search.reset_mock()
                self.preparer.return_value = QUERY.model_copy(update={"providers": selected})
                await self.run_plan()
                expected = [call(QUERY.query, providers=provider, top_k=limit)
                    for provider, limit in (("research", 10), ("web", 5))
                    if selected in (provider, "both")]
                self.search.assert_has_awaits(expected, any_order=True)
                self.assertEqual(self.search.await_count, len(expected))

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

    async def test_redone_onboarding_adjusts_only_remaining_coverage_with_latest_answers(self):
        protected = record(prescription(DAY + timedelta(days=1)), UUID(int=8))
        protected.exercises[0].sets[0].actual_reps = 5
        self.claim, self.context = inputs(workouts=[record(), protected])
        checkpoint = DAY + timedelta(days=13)
        self.context.schedule.horizon_end = checkpoint
        self.claim.horizon_end = self.claim.effective_through = checkpoint
        self.claim.job.reason = "onboarding answers changed"
        self.context.onboarding = OnboardingResponseRecord(user_id=OWNER,
            answers={"equipment": "dumbbells", "sessionMinutes": 25}, completed_at=NOW,
            created_at=NOW, updated_at=NOW)
        replacement = prescription()
        replacement.exercises[0].name = "Dumbbell goblet squat"
        candidate = proposal([replacement], [WORKOUT_ID], [DAY, DAY + timedelta(days=1)])
        candidate.day_decisions = candidate.day_decisions[:14]
        self.generator.return_value = response(candidate)
        result = await self.run_plan()
        self.assertEqual(result.before_ids, [WORKOUT_ID])
        self.assertEqual(result.day_decisions[-1].scheduled_date, checkpoint)
        packet = json.loads(self.generator.call_args.args[0][1].content)
        self.assertEqual(packet["task"]["kind"], "adjustment")
        self.assertEqual(packet["task"]["horizon_end"], str(checkpoint))
        self.assertEqual(packet["onboarding"], self.context.onboarding.answers)
        self.assertEqual(packet["editable_workout_ids"], [str(WORKOUT_ID)])

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
            self.assertIn("actual_reps", text)

    async def test_model_nodes_share_athlete_context_and_workouts_through_horizon(self):
        later_workout = record(prescription(END), UUID(int=8))
        self.claim, self.context = inputs(workouts=[record(), later_workout])
        self.claim.effective_through = DAY + timedelta(days=2)
        self.context.onboarding = OnboardingResponseRecord(user_id=OWNER,
            answers={"trainingDays": ["Mon", "Thu"], "equipment": "dumbbells"},
            created_at=NOW, updated_at=NOW)
        candidate = proposal(active_days=[DAY])
        candidate.day_decisions = candidate.day_decisions[:3]
        self.generator.return_value = response(candidate)
        await self.run_plan()
        messages = self.evaluator.call_args.args[0]
        self.assertEqual(len(messages), 3)
        shared = messages[1].content
        self.assertEqual(shared, self.preparer.call_args.args[0][1].content)
        self.assertEqual(shared, self.generator.call_args.args[0][1].content)
        context = json.loads(shared)
        self.assertEqual(context["onboarding"], self.context.onboarding.answers)
        self.assertEqual([item["scheduled_date"] for item in context["calendar"]["workouts"]],
            [str(DAY), str(END)])
        self.assertEqual(context["editable_workout_ids"], [str(WORKOUT_ID)])
        self.assertEqual(context["task"]["effective_through"], str(self.claim.effective_through))
        self.assertEqual(context["task"]["horizon_end"], str(END))
        self.assertEqual(context["task"]["workout_dates"], [str(DAY + timedelta(days=2))])
        packet = json.loads(messages[2].content)
        self.assertEqual(packet["research_question"], QUERY.query)
        self.assertEqual(packet["attempted_queries"], [QUERY.model_dump()])
        self.assertIn(SOURCE.content, packet["evidence"])
        self.assertIn("planned_reps", shared)

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
        for call in self.evaluator.await_args_list:
            self.assertEqual(call.args[0][1].content, self.preparer.call_args.args[0][1].content)
        first, final = [json.loads(call.args[0][-1].content) for call in self.evaluator.await_args_list]
        self.assertEqual(first["previous_gap"], "")
        self.assertEqual(final["previous_gap"], "recovery evidence missing")
        self.generator.assert_awaited_once()
        packet = json.loads(self.generator.call_args.args[0][-1].content)
        self.assertEqual(packet["evidence"].count(SOURCE.content), 1)

    async def test_novel_retry_honors_selected_providers(self):
        for selected in ("research", "web", "both"):
            with self.subTest(providers=selected):
                self.search.reset_mock()
                self.generator.reset_mock()
                next_query = SearchQuery(query="soccer concurrent training professional guideline", providers=selected)
                self.evaluator.side_effect = [review(False, next_query), review()]
                await self.run_plan()
                expected = [call(next_query.query, providers=provider, top_k=limit)
                    for provider, limit in (("research", 10), ("web", 5))
                    if selected in (provider, "both")]
                self.search.assert_has_awaits(expected, any_order=True)
                self.assertEqual(self.search.await_count, 1 + len(expected))
                self.generator.assert_awaited_once()

    async def test_provider_limits_keep_prior_evidence_and_partial_failure_warnings(self):
        query = QUERY.model_copy(update={"providers": "both"})
        source = SOURCE.model_copy(update={"document_id": "another-study", "content": "Prioritize technical work."})
        started = set()
        async def retrieve(query, *, providers, top_k):
            started.add(providers)
            await asyncio.sleep(0)
            self.assertEqual(started, {"research", "web"})
            return (SearchResponse(results=[SOURCE, source]) if providers == "research"
                else SearchResponse(warnings=["earlier warning", "web unavailable"]))
        self.search.side_effect = retrieve
        with patch.dict("app.ai.workflows.plan.nodes.search.RESULTS_PER_PROVIDER", research=8, web=3):
            result = await search_node({"research_deadline": monotonic() + 60, "search": query,
                "sources": [SOURCE], "searches": [QUERY], "warnings": ["earlier warning"]})
        self.search.assert_has_awaits([call(query.query, providers="research", top_k=8),
            call(query.query, providers="web", top_k=3)], any_order=True)
        self.assertEqual(result["sources"], [SOURCE, source])
        self.assertEqual(result["warnings"], ["earlier warning", "web unavailable"])
        self.assertEqual(result["searches"], [QUERY, query])

    async def test_insufficient_after_one_retry_never_generates(self):
        self.evaluator.return_value = review(False, SearchQuery(query="different recovery evidence", providers="research"))
        with self.assertRaisesRegex(RuntimeError, "insufficient"):
            await self.run_plan()
        self.assertEqual(self.search.await_count, 2)
        self.assertEqual(self.evaluator.await_count, 2)
        self.generator.assert_not_awaited()

    async def test_repeated_query_casing_and_punctuation_do_not_allow_retry(self):
        self.evaluator.return_value = review(False, QUERY.model_copy(update={"query": QUERY.query.upper() + "?!"}))
        state = {"research_deadline": monotonic() + 60, "sources": [SOURCE], "warnings": [],
            "searches": [QUERY.model_copy(update={"providers": "both"})], "context_packet": "{}", "retries_left": 1}
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

    async def test_unused_units_do_not_consume_generation_repair(self):
        self.generator.return_value["parsed"].workouts[0].exercises[0].distance_unit = "km"
        result = await self.run_plan()
        self.assertIsNone(result.workouts[0].exercises[0].distance_unit)
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
        for candidate in (proposal([prescription()]),
                proposal(invalid_prescriptions(), active_days=[DAY, DAY + timedelta(days=1)])):
            with self.subTest(candidate=candidate):
                self.generator.reset_mock()
                self.generator.return_value = response(candidate)
                with self.assertRaisesRegex(ValueError, "repair budget"):
                    await self.run_plan()
                self.assertEqual(self.generator.await_count, 2)

    async def test_one_repair_receives_all_prescription_errors_and_original_context(self):
        candidate = proposal(invalid_prescriptions(), active_days=[DAY, DAY + timedelta(days=1)])
        original = candidate.model_dump(mode="json")
        good = self.generator.return_value
        self.generator.side_effect = [response(candidate), good]
        result = await self.run_plan()
        self.assertEqual(result, good["parsed"])
        self.assertEqual(self.generator.await_count, 2)
        first, repair = (call.args[0] for call in self.generator.call_args_list)
        self.assertEqual(first[1].content, repair[1].content)
        feedback = json.loads(repair[-1].content)
        self.assertEqual(feedback["previous_proposal"], original)
        self.assertEqual(candidate.model_dump(mode="json"), original)
        self.assertEqual(feedback["evidence"], json.loads(first[-1].content)["evidence"])
        self.assertGreater(len(feedback["validation_issue"]), 500)
        self.assertIn("repetitions per side", feedback["validation_issue"])
        self.assertIn("repetitions, distance or duration", feedback["validation_issue"])
        for location in ("workouts[0].exercises[0].weight_unit", "workouts[0].exercises[1].sets[0]",
                "workouts[1].exercises[0].sets[0]", "workouts[1].exercises[0].sets[1]"):
            self.assertIn(location, feedback["validation_issue"])

    async def test_validation_does_not_repair_without_enough_generation_time(self):
        candidate = proposal(invalid_prescriptions(), active_days=[DAY, DAY + timedelta(days=1)])
        runtime = SimpleNamespace(context=SimpleNamespace(claim=self.claim, data=self.context))
        with self.assertRaisesRegex(ValueError, "repair budget"):
            await validate_node({"proposal": candidate, "repairs_left": 1, "deadline": monotonic() + 1}, runtime)
        self.generator.assert_not_awaited()

    async def test_repair_feedback_has_explicit_character_limit_and_omission_marker(self):
        runtime = SimpleNamespace(context=SimpleNamespace(claim=self.claim, data=self.context))
        result = await validate_node({"proposal": None, "validation_error": "invalid field; " * 400,
            "repairs_left": 1, "deadline": monotonic() + 120}, runtime)
        self.assertLessEqual(len(result["validation_error"]), 4000)
        self.assertTrue(result["validation_error"].endswith(
            "additional validation feedback omitted; check the complete proposal"))
        self.assertTrue(result["retry_generation"])
        self.assertEqual(result["repairs_left"], 0)

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
