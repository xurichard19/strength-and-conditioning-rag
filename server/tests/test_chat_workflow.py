import asyncio
from dataclasses import replace
from datetime import UTC, date, datetime
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage

from app.ai.services.search import SearchResponse
from app.ai.workflows.chat import graph
from app.ai.workflows.chat.state import CHAT_POLICIES, ChatRoute, EvidenceReview, SearchQuery, WorkflowContext
from app.contracts import Source


ID = UUID('22222222-2222-4222-8222-222222222222')
CONTEXT = WorkflowContext(user_id=str(ID), access_token='private-token', conversation_id=ID,
    message_id=ID, message_created_at=datetime(2026, 9, 16, tzinfo=UTC))
TODAY = CONTEXT.message_created_at.date()


def route(providers='both', user_context='none'):
    return ChatRoute(search=SearchQuery(query='boxing power' if providers != 'none' else '', providers=providers),
        user_context=user_context, start_date=None, end_date=None)


def review(query='', sufficient=False, providers='research'):
    return EvidenceReview(sufficient=sufficient, gap='' if sufficient else 'missing strength evidence',
        next_search=SearchQuery(query=query, providers=providers if query else 'none'))


class ChatWorkflowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict('os.environ', {'LANGSMITH_TRACING': 'false', 'LANGCHAIN_TRACING_V2': 'false'}))
        self.history = self.enterContext(patch('app.ai.workflows.chat.nodes.load_history.load_history',
            new=AsyncMock(return_value=[HumanMessage(content='prior question'), AIMessage(content='prior answer')])) )
        self.profile = self.enterContext(patch('app.ai.workflows.chat.nodes.load_history.get_profile',
            return_value=SimpleNamespace(timezone='UTC', email='private-profile@example.invalid')))
        self.user_context = self.enterContext(patch('app.ai.workflows.chat.nodes.context.load_user_context',
            new=AsyncMock(return_value={'training': []})))
        self.search = self.enterContext(patch('app.ai.workflows.chat.nodes.search.search_sources',
            new=AsyncMock(return_value=SearchResponse())))
        self.router = AsyncMock(return_value=route())
        self.evaluator = AsyncMock(return_value=review(sufficient=True))
        self.generator = AsyncMock(return_value=AIMessage(content='answer'))
        self.enterContext(patch('app.ai.workflows.chat.nodes.route.decision_model', return_value=SimpleNamespace(ainvoke=self.router)))
        self.enterContext(patch('app.ai.workflows.chat.nodes.evaluate.decision_model', return_value=SimpleNamespace(ainvoke=self.evaluator)))
        self.enterContext(patch('app.ai.workflows.chat.nodes.generate.answer_model', return_value=SimpleNamespace(ainvoke=self.generator)))

    async def run_chat(self, mode='quick', message='current question'):
        return [event async for event in graph.stream_chat(graph.build_chat_workflow(), message, CONTEXT, mode)]

    async def test_no_search_or_training_read_for_conversational_turn(self):
        self.router.return_value = route('none')
        events = await self.run_chat()
        self.history.assert_awaited_once_with(CONTEXT, limit=5)
        self.search.assert_not_awaited()
        self.evaluator.assert_not_awaited()
        self.user_context.assert_not_awaited()
        inputs = self.generator.call_args.args[0]
        self.assertEqual([message.content for message in inputs[1:3]], ['prior question', 'prior answer'])
        self.assertEqual(inputs[-1].content, 'current question')
        self.assertNotIn('private-token', str(inputs))
        self.assertEqual(''.join(event['delta'] for event in events if event['type'] == 'text'), 'answer')

    async def test_user_context_is_optional_and_read_once_not_on_each_search_retry(self):
        self.router.return_value = route(user_context='training')
        self.evaluator.return_value = review('boxing strength intervention')
        await self.run_chat()
        self.user_context.assert_awaited_once_with(CONTEXT, self.router.return_value, TODAY)
        self.assertEqual(self.search.await_count, 2)
        self.assertEqual(self.evaluator.await_count, 1)
        self.assertIn('training', str(self.generator.call_args.args[0]))

    async def test_training_only_request_does_not_search(self):
        self.router.return_value = route('none', 'training')
        await self.run_chat()
        self.user_context.assert_awaited_once()
        self.search.assert_not_awaited()

    async def test_profile_only_request_loads_context_without_research(self):
        self.router.return_value = route('none', 'profile')
        await self.run_chat()
        self.user_context.assert_awaited_once_with(CONTEXT, self.router.return_value, TODAY)
        self.search.assert_not_awaited()

    async def test_context_and_search_run_concurrently_then_evaluate_and_generate_once(self):
        self.router.return_value = route(user_context='training')
        context_started, search_started = asyncio.Event(), asyncio.Event()
        async def context_read(*args):
            context_started.set()
            await asyncio.wait_for(search_started.wait(), 1)
            return {'training': [], 'onboarding': {'goal': 'force café'}}
        async def research(*args, **kwargs):
            search_started.set()
            await asyncio.wait_for(context_started.wait(), 1)
            return SearchResponse(results=[Source(source_type='research', document_id='one', content='finding')])
        self.user_context.side_effect, self.search.side_effect = context_read, research
        await self.run_chat()
        self.evaluator.assert_awaited_once()
        self.generator.assert_awaited_once()
        evaluated = json.loads(self.evaluator.call_args.args[0][-1].content)
        generated = json.loads(self.generator.call_args.args[0][-2].content.split('\n', 1)[1])
        for packet in [evaluated, generated]:
            self.assertEqual(packet['user_data']['onboarding']['goal'], 'force café')
            self.assertIn('finding', packet['evidence'])

    async def test_failed_context_read_cancels_parallel_search(self):
        self.router.return_value = route(user_context='training')
        search_started, cancelled = asyncio.Event(), asyncio.Event()
        async def context_read(*args):
            await asyncio.wait_for(search_started.wait(), 1)
            raise RuntimeError('read failed')
        async def research(*args, **kwargs):
            search_started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        self.user_context.side_effect, self.search.side_effect = context_read, research
        with self.assertRaisesRegex(RuntimeError, 'read failed'):
            await self.run_chat()
        await asyncio.wait_for(cancelled.wait(), 1)
        self.evaluator.assert_not_awaited()
        self.generator.assert_not_awaited()
        self.evaluator.assert_not_awaited()

    async def test_modes_change_message_count_but_use_the_same_calendar_window(self):
        self.router.return_value = route('none', 'training')
        for mode, messages in [('quick', 5), ('deep', 10)]:
            with self.subTest(mode=mode):
                self.history.reset_mock(); self.user_context.reset_mock()
                await self.run_chat(mode)
                self.history.assert_awaited_once_with(CONTEXT, limit=messages)
                self.user_context.assert_awaited_once_with(CONTEXT, self.router.return_value, TODAY)

    async def test_router_gets_the_users_local_day_and_history_without_profile_identity(self):
        self.profile.return_value.timezone = 'America/New_York'
        self.router.return_value = route('none', 'training').model_copy(update={
            'start_date': date(2026, 9, 22), 'end_date': date(2026, 9, 22)})
        await self.run_chat(message='what about next Tuesday?')
        inputs = self.router.call_args.args[0]
        self.assertIn("User's current local date: 2026-09-15 (Tuesday)", inputs[0].content)
        self.assertEqual([message.content for message in inputs[1:]], ['prior question', 'prior answer', 'what about next Tuesday?'])
        self.assertNotIn('private-profile', str(inputs))
        self.assertNotIn(CONTEXT.access_token, str(inputs))
        self.profile.assert_called_once_with(CONTEXT.user_id, CONTEXT.access_token)
        self.user_context.assert_awaited_once_with(CONTEXT, self.router.return_value, date(2026, 9, 15))

    async def test_unavailable_or_invalid_timezone_stops_before_routing(self):
        for profile in [None, SimpleNamespace(timezone='not/a-timezone')]:
            with self.subTest(profile=profile):
                self.profile.return_value = profile
                with self.assertRaises((ValueError, KeyError)):
                    await self.run_chat()
                self.router.assert_not_awaited()
                self.generator.assert_not_awaited()

    async def test_quick_and_deep_stop_at_exact_budget_without_final_evaluator(self):
        for mode, rounds in [('quick', 2), ('deep', 4)]:
            with self.subTest(mode=mode):
                self.search.reset_mock(); self.evaluator.reset_mock()
                self.evaluator.side_effect = [review(f'boxing study {index}') for index in range(3)]
                await self.run_chat(mode)
                self.assertEqual(self.search.await_count, rounds)
                self.assertEqual(self.evaluator.await_count, rounds - 1)
                self.assertTrue(all(call.kwargs['top_k'] == (5 if mode == 'quick' else 10) for call in self.search.call_args_list))

    async def test_sufficient_evidence_stops_early(self):
        await self.run_chat('deep')
        self.assertEqual(self.search.await_count, 1)
        self.assertEqual(self.evaluator.await_count, 1)

    async def test_slow_retrieval_skips_evaluation_to_preserve_answer_time(self):
        with patch('app.ai.workflows.chat.graph.monotonic', return_value=100), \
             patch('app.ai.workflows.chat.nodes.evaluate.monotonic', return_value=140):
            await self.run_chat()
        self.search.assert_awaited_once()
        self.evaluator.assert_not_awaited()
        self.generator.assert_awaited_once()
        self.assertIn('research time budget reached', str(self.generator.call_args.args[0]))

    async def test_retry_is_skipped_if_evaluation_used_the_remaining_research_time(self):
        self.evaluator.return_value = review('new evidence')
        with patch('app.ai.workflows.chat.graph.monotonic', return_value=100), \
             patch('app.ai.workflows.chat.nodes.evaluate.monotonic', side_effect=[129, 151]):
            await self.run_chat()
        self.evaluator.assert_awaited_once()
        self.search.assert_awaited_once()
        self.generator.assert_awaited_once()

    async def test_repeated_or_empty_queries_do_not_spend_retry(self):
        for query in ['BOXING power!', '', '!!!']:
            with self.subTest(query=query):
                self.search.reset_mock()
                self.evaluator.return_value = review(query)
                await self.run_chat('deep')
                self.assertEqual(self.search.await_count, 1)

    async def test_retry_same_query_searches_only_providers_not_yet_attempted(self):
        self.router.return_value = route('research')
        self.evaluator.return_value = review('BOXING power!', providers='both')
        await self.run_chat('deep')
        self.assertEqual([call.kwargs['providers'] for call in self.search.call_args_list], ['research', 'web'])
        self.assertEqual(self.evaluator.await_count, 2)
        self.generator.assert_awaited_once()

    async def test_retry_keeps_word_order_when_it_changes_query_meaning(self):
        self.router.return_value = route('research').model_copy(update={
            'search': SearchQuery(query='running before lifting', providers='research')})
        self.evaluator.return_value = review('lifting before running')
        await self.run_chat()
        self.assertEqual([call.args[0] for call in self.search.call_args_list],
            ['running before lifting', 'lifting before running'])

    async def test_distinct_evidence_survives_retries_and_duplicate_passages_collapse(self):
        first = Source(source_type='research', document_id='chunk-a', content='earlier useful finding')
        second = Source(source_type='research', document_id='chunk-b', content='new finding')
        self.search.side_effect = [SearchResponse(results=[first]), SearchResponse(results=[first, second])]
        self.evaluator.return_value = review('boxing strength study')
        events = await self.run_chat()
        sources = next(event['sources'] for event in events if event['type'] == 'sources')
        self.assertEqual([source['document_id'] for source in sources], ['chunk-a', 'chunk-b'])
        self.assertIn(first.content, str(self.generator.call_args.args[0]))
        self.assertIn(second.content, str(self.generator.call_args.args[0]))

    async def test_search_warnings_reach_evaluation_and_generation(self):
        warning = 'web search unavailable; no evidence from this attempt'
        self.search.return_value = SearchResponse(warnings=[warning])
        await self.run_chat()
        self.assertIn(warning, str(self.evaluator.call_args.args[0]))
        self.assertIn(warning, str(self.generator.call_args.args[0]))

    async def test_evaluator_failure_generates_with_explicit_warnings(self):
        self.evaluator.side_effect = TimeoutError('private provider error')
        await self.run_chat()
        self.assertEqual(self.search.await_count, 1)
        prompt = str(self.generator.call_args.args[0])
        self.assertIn('warnings', prompt)
        self.assertIn('adequacy could not be checked', prompt)
        self.assertNotIn('private provider error', prompt)

    async def test_invalid_evaluation_response_does_not_break_generation(self):
        self.evaluator.return_value = None
        await self.run_chat()
        self.assertEqual(self.search.await_count, 1)
        self.generator.assert_awaited_once()

    async def test_token_limited_generation_is_not_reported_as_complete(self):
        self.generator.return_value = AIMessage(content='partial', response_metadata={'finish_reason': 'length'})
        with self.assertRaisesRegex(ValueError, 'did not complete'):
            await self.run_chat()

    async def test_failed_history_or_user_data_cannot_generate_an_invented_answer(self):
        self.history.side_effect = RuntimeError('read failed')
        with self.assertRaises(RuntimeError):
            await self.run_chat()
        self.generator.assert_not_awaited()
        self.history.side_effect = None
        self.router.return_value = route('none', 'training')
        self.user_context.side_effect = RuntimeError('read failed')
        with self.assertRaises(RuntimeError):
            await self.run_chat()
        self.generator.assert_not_awaited()

    async def test_invalid_routing_does_not_search_or_read_private_training(self):
        self.router.side_effect = ValueError('invalid decision')
        with self.assertRaises(ValueError):
            await self.run_chat()
        self.search.assert_not_awaited()
        self.user_context.assert_not_awaited()

    async def test_progress_is_emitted_before_waiting_for_history(self):
        release = asyncio.Event()
        async def history(_context, *, limit):
            await release.wait()
            return []
        self.history.side_effect = history
        stream = graph.stream_chat(graph.build_chat_workflow(), 'question', CONTEXT)
        try:
            self.assertEqual(await asyncio.wait_for(anext(stream), 2), {'type': 'status', 'stage': 'fetching_user_context'})
        finally:
            release.set()
            await stream.aclose()

    async def test_adapter_excludes_internal_tokens_and_unknown_status_fields(self):
        async def parts(*args, **kwargs):
            self.assertIn('custom', kwargs['stream_mode'])
            yield {'type': 'custom', 'data': {'private': 'do not expose'}}
            for node in ['route', 'evaluate', 'search']:
                yield {'type': 'messages', 'data': (AIMessage(content='internal'), {'langgraph_node': node})}
            yield {'type': 'custom', 'data': {'type': 'status', 'stage': 'unknown'}}
            yield {'type': 'custom', 'data': {'type': 'status', 'stage': 'thinking', 'private': 'hidden'}}
            yield {'type': 'messages', 'data': (AIMessage(content='answer'), {'langgraph_node': 'generate'})}
        events = [event async for event in graph.stream_chat(SimpleNamespace(astream=parts), 'question', CONTEXT)]
        self.assertEqual(events, [{'type': 'status', 'stage': 'thinking'}, {'type': 'text', 'delta': 'answer'},
            {'type': 'sources', 'sources': []}, {'type': 'done'}])

    async def test_deadline_cancels_work_and_does_not_emit_done(self):
        cancelled = asyncio.Event()
        async def parts(*args, **kwargs):
            try:
                await asyncio.Event().wait()
                yield {}
            finally:
                cancelled.set()
        with patch.dict(CHAT_POLICIES, {'quick': replace(CHAT_POLICIES['quick'], deadline_seconds=.02)}):
            with self.assertRaises(TimeoutError):
                async for _ in graph.stream_chat(SimpleNamespace(astream=parts), 'question', CONTEXT):
                    self.fail('unexpected event')
        self.assertTrue(cancelled.is_set())

    async def test_simultaneous_turns_have_independent_retry_state(self):
        self.evaluator.return_value = review('new boxing evidence')
        runs = await asyncio.gather(self.run_chat(), self.run_chat())
        self.assertEqual(self.search.await_count, 4)
        self.assertTrue(all(events[-1] == {'type': 'done'} for events in runs))
