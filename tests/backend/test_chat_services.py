import asyncio
from datetime import date
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from chromadb.api.types import SearchResult, SparseVector

from app.ai.services import conversations, search, user_context
from app.ai.workflows.chat import models
from app.ai.workflows.chat.state import ChatRoute, EvidenceReview
from app.api.schemas import ChatSourcesEvent
from app.contracts import CalendarRecords, MessageRecord, Source
from app.db.supabase import calendar
from tests.backend.test_chat_workflow import CONTEXT, ID, TODAY, route
from tests.backend.test_supabase_queries import workout_row


def hybrid_collection(result):
    sparse = SimpleNamespace(embed_query=Mock(return_value=[SparseVector(indices=[1], values=[.3])]))
    index = SimpleNamespace(enabled=True, config=SimpleNamespace(embedding_function=sparse))
    schema = SimpleNamespace(keys={'sparse_embedding': SimpleNamespace(sparse_vector=SimpleNamespace(sparse_vector_index=index))})
    return SimpleNamespace(schema=schema, query=AsyncMock(), search=AsyncMock(return_value=result))


class ChatServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict('os.environ', {'LANGSMITH_TRACING': 'false', 'LANGCHAIN_TRACING_V2': 'false'}))

    async def test_history_preserves_owned_cursor_roles_full_contents_and_mode_limits(self):
        rows = [MessageRecord(conversation_id=ID, id=ID, user_id=ID,
            role='user' if index % 2 == 0 else 'assistant', content=f'message {index}: ' + 'x' * 10000,
            created_at=CONTEXT.message_created_at) for index in range(10)]
        for options in ({}, {'limit': 5}, {'limit': 10}):
            limit = options.get('limit', 10)
            with self.subTest(options=options), patch.object(conversations, 'get_recent_messages', return_value=rows[:limit]) as read:
                history = await conversations.load_history(CONTEXT, **options)
                read.assert_called_once_with(CONTEXT.user_id, CONTEXT.access_token, limit, conversation_id=ID,
                    before_created_at=CONTEXT.message_created_at, before_id=ID)
                self.assertEqual(len(history), limit)
                self.assertEqual([message.content for message in history], [row.content for row in rows[:limit]])
                self.assertEqual([message.type for message in history],
                    ['human' if row.role == 'user' else 'ai' for row in rows[:limit]])
        self.assertNotIn(CONTEXT.access_token, repr(CONTEXT))

    async def test_concurrent_cold_requests_initialize_only_one_collection(self):
        collection = object()
        async def get_collection(name):
            await asyncio.sleep(0)
            return collection
        client = SimpleNamespace(get_collection=AsyncMock(side_effect=get_collection))
        settings = SimpleNamespace(chroma_api_key='test', chroma_tenant='test', chroma_database='test', system_collection_name='research')
        with patch.object(search, '_collection', None), patch.object(search, '_collection_lock', asyncio.Lock()), \
             patch.object(search, 'get_settings', return_value=settings), \
             patch.object(search.chromadb, 'AsyncHttpClient', new=AsyncMock(return_value=client)) as factory:
            results = await asyncio.gather(search.research_collection(), search.research_collection())
        self.assertEqual(results, [collection, collection])
        factory.assert_awaited_once()
        client.get_collection.assert_awaited_once_with('research')

    async def test_research_uses_async_queries_with_original_chunk_ids_without_fabricated_doi(self):
        passage = 'finding ' * 250
        result = SearchResult(ids=[['chunk-1', 'chunk-2']], documents=[[passage, '']],
            metadatas=[[{'source': r'C:\private\paper.pdf'}, None]], scores=[[-.04, 0]])
        collection = hybrid_collection(result)
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, '_research_embeddings', return_value=[[.1, .2]]):
            sources = await search.hybrid_search_research_docs('public question', 3)
        self.assertEqual(sources[0].chunk_id, 'chunk-1')
        self.assertIsNone(sources[0].document_id)
        self.assertIsNone(sources[0].doi)
        self.assertIsNone(sources[0].title)
        self.assertEqual(sources[0].content, passage.strip())
        collection.query.assert_not_awaited()
        collection.search.assert_awaited_once()
        self.assertEqual(collection.search.call_args.args[0].to_dict()['limit']['limit'], 3)

    async def test_deprecated_dense_helper_remains_callable_with_citation_metadata(self):
        metadata = {'document_id': '489cd9ad-7d53-4b34-8c56-6953edb2885c',
            'title': 'Training plans', 'author': 'A. Author', 'doi': 'none', 'page': 2}
        identifier = '50a3d460-c74b-4fe1-971c-dfa32567ddfd'
        collection = SimpleNamespace(query=AsyncMock(return_value={
            'ids': [[identifier, 'empty']], 'documents': [[' full excerpt ', '']], 'metadatas': [[metadata, None]]}))
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, '_research_embeddings', return_value=[[.1, .2]]):
            sources = await search.search_research_docs('training', 2)
        self.assertEqual(sources, [Source(source_type='research', chunk_id=identifier,
            document_id=metadata['document_id'], title='Training plans', author='A. Author', page=2, content='full excerpt')])
        collection.query.assert_awaited_once_with(query_embeddings=[[.1, .2]], n_results=2, include=['documents', 'metadatas'])

    async def test_research_uses_only_explicit_citations_and_treats_none_as_missing(self):
        metadata = [
            {'source': 'papers/10.1234:journal.2026.001.pdf'},
            {'source': 'papers/489cd9ad-7d53-4b34-8c56-6953edb2885c.pdf', 'doi': 'none', 'title': ' none '},
            {'source': '10.1234:inferred.pdf', 'doi': '10.9999/explicit', 'title': 'Paper title'},
            {'source': 'notes:recovery.pdf'},
            None,
        ]
        result = SearchResult(ids=[[str(i) for i in range(5)]],
            documents=[['full excerpt'] * 5], metadatas=[metadata], scores=[[-.04] * 5])
        collection = hybrid_collection(result)
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, '_research_embeddings', return_value=[[.1, .2]]):
            sources = await search.hybrid_search_research_docs('recovery', 5)
        self.assertEqual([source.doi for source in sources],
            [None, None, '10.9999/explicit', None, None])
        self.assertIsNone(sources[0].title)
        self.assertIsNone(sources[1].title)
        self.assertEqual(sources[2].title, 'Paper title')
        self.assertTrue(all(source.content == 'full excerpt' for source in sources))

    async def test_research_citations_keep_paper_uuid_separate_from_chunks_through_the_public_stream(self):
        metadata = {'document_id': '489cd9ad-7d53-4b34-8c56-6953edb2885c', 'title': 'Training plans',
            'doi': '10.1234/training', 'author': 'A. Author; B. Author', 'publication_year': '2024',
            'journal': 'Training', 'publisher': 'Publisher', 'license': 'CC BY 4.0',
            'license_url': 'https://creativecommons.org/licenses/by/4.0/', 'copyright_notice': 'Copyright the authors'}
        chunk_ids = ['50a3d460-c74b-4fe1-971c-dfa32567ddfd', 'c1965c92-1fe9-45ec-bdfc-41c69dd3d6e4']
        result = SearchResult(ids=[chunk_ids], documents=[['first passage', 'second passage']],
            metadatas=[[{**metadata, 'page': 1}, {**metadata, 'page': 2}]], scores=[[-.04, -.03]])
        collection = hybrid_collection(result)
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, '_research_embeddings', return_value=[[.1, .2]]):
            response = await search.search_sources('training', providers='research', top_k=2)
        sources = response.results
        self.assertEqual(response.warnings, [])
        collection.query.assert_not_awaited()
        collection.search.assert_awaited_once()
        event = ChatSourcesEvent.model_validate({'sources': [source.model_dump() for source in sources]})
        payload = json.loads(event.model_dump_json())['sources']
        for index, source in enumerate(payload):
            self.assertEqual({field: source[field] for field in metadata}, metadata)
            self.assertEqual(source['chunk_id'], chunk_ids[index])
            self.assertEqual(source['page'], index + 1)
            self.assertEqual(source['score'], [-.04, -.03][index])
        self.assertIn('10.1234/training', search.format_sources_for_prompt(sources))

    async def test_cached_collection_does_not_acquire_initialization_lock(self):
        collection, lock = object(), AsyncMock()
        with patch.object(search, '_collection', collection), patch.object(search, '_collection_lock', lock):
            self.assertIs(await search.research_collection(), collection)
        lock.__aenter__.assert_not_awaited()

    async def test_web_preserves_provider_urls_and_text_without_clipping_results(self):
        title, passage = 'title' * 100, 'text' * 10000
        url = 'https://example.org/paper?edition=2#findings'
        client = SimpleNamespace(ainvoke=AsyncMock(return_value={'results': [
            {'url': 'https://example.org/empty', 'content': ' '},
            {'url': url, 'content': passage, 'title': title},
        ]}))
        with patch.object(search, 'web_search_client', return_value=client):
            sources = await search.web_search('public query', 1)
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0].url, url)
        self.assertEqual(sources[0].content, passage)
        self.assertEqual(sources[0].title, title)
        self.assertIsNone(sources[0].doi)

    async def test_selected_providers_run_concurrently_and_partial_failure_retains_evidence(self):
        started = asyncio.Event()
        async def research(*args):
            await asyncio.wait_for(started.wait(), 1)
            raise TimeoutError('secret provider error')
        async def web(*args):
            started.set()
            return [Source(source_type='web', url='https://example.org', content='usable result')]
        with patch.object(search, 'hybrid_search_research_docs', side_effect=research), patch.object(search, 'web_search', side_effect=web):
            response = await search.search_sources('test', top_k=3)
        self.assertEqual(len(response.results), 1)
        self.assertIn('research search unavailable', response.warnings[0])
        self.assertNotIn('secret', str(response))

    async def test_retrieval_cancellation_is_not_swallowed_as_an_empty_result(self):
        with patch.object(search, 'web_search', side_effect=asyncio.CancelledError):
            with self.assertRaises(asyncio.CancelledError):
                await search.search_sources('test', providers='web')

    def test_dedup_normalizes_duplicates_but_preserves_distinct_passages_and_shared_prefixes(self):
        one = Source(source_type='research', doi='10.1/a', document_id='a', content='First finding')
        duplicate = Source(source_type='web', url='https://example.org', content='first   finding')
        two = Source(source_type='research', doi='10.1/a', document_id='b', content='Second finding')
        merged = search.merge_sources([one], [duplicate, two])
        self.assertEqual(merged, [one, two])
        many = [Source(source_type='research', document_id=str(i), content='x' * 4000 + str(i)) for i in range(50)]
        self.assertEqual(search.merge_sources([], many), many)

    async def test_search_accepts_long_queries_and_forwards_provider_result_count(self):
        query = 'training ' * 100
        with patch.object(search, 'hybrid_search_research_docs', new=AsyncMock(return_value=[])) as read, \
             patch.object(search, 'search_research_docs', new=AsyncMock()) as dense:
            await search.search_sources(query, providers='research', top_k=10)
        read.assert_awaited_once_with(query, 10)
        dense.assert_not_awaited()

    async def test_hybrid_search_keeps_rrf_weights_identifiers_and_original_text(self):
        sparse = SimpleNamespace(embed_query=Mock(return_value=[SparseVector(indices=[1], values=[.3])]))
        index = SimpleNamespace(enabled=True, config=SimpleNamespace(embedding_function=sparse))
        schema = SimpleNamespace(keys={'sparse_embedding': SimpleNamespace(sparse_vector=SimpleNamespace(sparse_vector_index=index))})
        metadata = {'doi': '10.1/a', 'document_id': 'paper-uuid', 'author': 'A. Author',
            'license_url': 'https://creativecommons.org/licenses/by/4.0/', 'page': 2}
        result = SearchResult(ids=[['chunk-1', 'empty']], documents=[['full passage', ' ']],
            metadatas=[[metadata, None]], scores=[[-.04, 0]])
        collection = SimpleNamespace(schema=schema, search=AsyncMock(return_value=result))
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, '_research_embeddings', return_value=[[.1, .2]]), \
             patch.object(search, 'Rrf', wraps=search.Rrf) as rank:
            sources = await search.hybrid_search_research_docs('boxing', top_k=7)
        sparse.embed_query.assert_called_once_with(['boxing'])
        self.assertEqual(rank.call_args.kwargs['weights'], [2.0, 1.0])
        self.assertTrue(all(knn.return_rank and knn.limit == 75 and knn.default == 1000 for knn in rank.call_args.kwargs['ranks']))
        payload = collection.search.call_args.args[0].to_dict()
        self.assertEqual(payload['limit']['limit'], 7)
        self.assertIn('sparse_embedding', json.dumps(payload))
        for field in search.RESEARCH_METADATA_FIELDS:
            self.assertIn(field, json.dumps(payload['select']))
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0].chunk_id, 'chunk-1')
        self.assertEqual(sources[0].content, 'full passage')
        self.assertEqual({field: getattr(sources[0], field) for field in metadata}, metadata)
        self.assertEqual(sources[0].score, -.04)

    async def test_hybrid_returns_no_matches_when_query_has_no_keyword_tokens(self):
        sparse = SimpleNamespace(embed_query=Mock(return_value=[SparseVector(indices=[], values=[])]))
        index = SimpleNamespace(enabled=True, config=SimpleNamespace(embedding_function=sparse))
        schema = SimpleNamespace(keys={'sparse_embedding': SimpleNamespace(sparse_vector=SimpleNamespace(sparse_vector_index=index))})
        result = SearchResult(ids=[['chunk-1']], documents=[['full passage']], metadatas=[[None]], scores=[[.2]])
        collection = SimpleNamespace(schema=schema, search=AsyncMock(return_value=result))
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, '_research_embeddings', return_value=[[.1, .2]]):
            sources = await search.hybrid_search_research_docs('the and of', 5)
        self.assertEqual(sources, [])
        collection.search.assert_not_awaited()

    async def test_research_requires_sparse_schema_without_running_dense_queries(self):
        collection = SimpleNamespace(schema=None, search=AsyncMock(), query=AsyncMock())
        with patch.object(search, 'research_collection', new=AsyncMock(return_value=collection)), \
             patch.object(search, 'search_research_docs', new=AsyncMock()) as dense:
            response = await search.search_sources('boxing', providers='research')
        self.assertEqual(response.results, [])
        self.assertEqual(response.warnings, ['research search unavailable; no evidence from this attempt'])
        collection.search.assert_not_awaited()
        collection.query.assert_not_awaited()
        dense.assert_not_awaited()

    async def test_optional_rerank_preserves_original_text_and_does_not_retry(self):
        client = SimpleNamespace(rerank=AsyncMock(return_value=SimpleNamespace(results=[SimpleNamespace(index=1), SimpleNamespace(index=0)])))
        documents = ['first original passage', 'second original passage']
        with patch.object(search, 'rerank_client', return_value=client) as factory:
            self.assertEqual(await search.rerank_research_results('boxing', []), [])
            factory.assert_not_called()
            result = await search.rerank_research_results('boxing', documents)
        self.assertEqual(result, documents[::-1])
        client.rerank.assert_awaited_once_with(model='rerank-v4.0-fast', query='boxing', documents=documents,
            top_n=2, request_options={'max_retries': 0})

    def test_tavily_clients_keep_result_limits_immutable_and_disable_extra_payloads(self):
        search.web_search_client.cache_clear()
        self.addCleanup(search.web_search_client.cache_clear)
        with patch.object(search, 'get_settings', return_value=SimpleNamespace(tavily_api_key='test')), \
             patch.object(search, 'TavilySearch') as factory:
            search.web_search_client(5); search.web_search_client(10); search.web_search_client(5)
        self.assertEqual(factory.call_count, 2)
        self.assertEqual([call.kwargs['max_results'] for call in factory.call_args_list], [5, 10])
        self.assertTrue(all(call.kwargs['include_answer'] is False for call in factory.call_args_list))

    async def test_profile_context_excludes_identity_and_skips_training_read(self):
        onboarding = SimpleNamespace(answers={'goal': 'strength'})
        with patch.object(user_context, 'get_onboarding_response', return_value=onboarding) as profile, \
             patch.object(user_context, 'get_calendar') as read:
            data = await user_context.load_user_context(CONTEXT, route('none', 'profile'), TODAY)
        read.assert_not_called()
        profile.assert_called_once_with(CONTEXT.user_id, CONTEXT.access_token)
        self.assertEqual(data['onboarding'], {'goal': 'strength'})
        self.assertNotIn(CONTEXT.access_token, str(data))

    async def test_none_context_skips_profile_and_training_reads(self):
        with patch.object(user_context, 'get_onboarding_response') as profile, \
             patch.object(user_context, 'get_calendar') as training:
            data = await user_context.load_user_context(CONTEXT, route('none'), TODAY)
        profile.assert_not_called()
        training.assert_not_called()
        self.assertEqual(data, {'local_today': str(TODAY)})

    async def test_training_loader_can_run_without_profile_retrieval(self):
        with patch.object(user_context, 'get_onboarding_response') as profile, \
             patch.object(user_context, 'get_calendar', return_value=CalendarRecords(workouts=[], sports_workouts=[])) as training:
            data = await user_context.load_training_context(CONTEXT, TODAY, TODAY)
        profile.assert_not_called()
        training.assert_called_once_with(CONTEXT.user_id, date(2026, 9, 11), date(2026, 9, 21), CONTEXT.access_token)
        self.assertEqual(data['training'], {'workouts': [], 'sports_workouts': []})

    async def test_training_route_loads_profile_and_calendar_concurrently(self):
        training_started = asyncio.Event()
        async def profile_read(context):
            await asyncio.wait_for(training_started.wait(), 1)
            return {'onboarding': {'goal': 'strength'}}
        async def training_read(context, start, end):
            training_started.set()
            return {'training': {'workouts': [], 'sports_workouts': []}}
        with patch.object(user_context, 'load_profile_context', side_effect=profile_read) as profile, \
             patch.object(user_context, 'load_training_context', side_effect=training_read) as training:
            data = await user_context.load_user_context(CONTEXT, route('none', 'training'), TODAY)
        profile.assert_awaited_once_with(CONTEXT)
        training.assert_awaited_once_with(CONTEXT, TODAY, TODAY)
        self.assertEqual(data['onboarding'], {'goal': 'strength'})
        self.assertEqual(data['training'], {'workouts': [], 'sports_workouts': []})

    async def test_calendar_context_expands_requested_dates_and_defaults_to_local_today(self):
        windows = [
            (None, None, date(2026, 9, 11), date(2026, 9, 21)),
            (date(2026, 10, 2), date(2026, 10, 2), date(2026, 9, 27), date(2026, 10, 7)),
            (date(2026, 9, 1), date(2026, 9, 30), date(2026, 8, 27), date(2026, 10, 5)),
            (None, date(2027, 1, 1), date(2026, 12, 27), date(2027, 1, 6)),
            (date(2026, 9, 7), date(2026, 9, 13), date(2026, 9, 2), date(2026, 9, 18)),
        ]
        for start, end, expected_start, expected_end in windows:
            with self.subTest(start=start, end=end), \
                 patch.object(user_context, 'get_onboarding_response', return_value=None), \
                 patch.object(user_context, 'get_calendar', return_value=CalendarRecords(workouts=[], sports_workouts=[])) as read:
                decision = route('none', 'training').model_copy(update={'start_date': start, 'end_date': end})
                data = await user_context.load_user_context(CONTEXT, decision, TODAY)
                read.assert_called_once_with(CONTEXT.user_id, expected_start, expected_end, CONTEXT.access_token)
                self.assertEqual(data['range'], {'start': str(expected_start), 'end': str(expected_end)})

    async def test_context_preserves_workouts_nested_details_and_onboarding_without_text_clipping(self):
        row = workout_row()
        row['exercises'] = [dict(id=str(ID), workout_id=row['id'], order_index=i, name='squat',
            created_at=row['created_at'], updated_at=row['updated_at'], notes='x' * 600,
            sets=[dict(id=str(ID), exercise_id=str(ID), order_index=j, planned_reps=5,
                created_at=row['created_at'], updated_at=row['updated_at']) for j in range(9)]) for i in range(13)]
        sport = dict(id=str(ID), user_id=CONTEXT.user_id, sport='boxing', scheduled_date=str(TODAY),
            created_at=row['created_at'], updated_at=row['updated_at'])
        records = CalendarRecords.model_validate({'workouts': [row] * 21, 'sports_workouts': [sport] * 21})
        with patch.object(user_context, 'get_onboarding_response', return_value=SimpleNamespace(answers={'notes': 'x' * 20000})), \
             patch.object(user_context, 'get_calendar', return_value=records):
            data = await user_context.load_user_context(CONTEXT, route('none', 'training'), TODAY)
        self.assertEqual(len(data['training']['workouts']), 21)
        self.assertEqual(len(data['training']['sports_workouts']), 21)
        exercises = data['training']['workouts'][0]['exercises']
        self.assertEqual(len(exercises), 13)
        self.assertEqual(len(exercises[0]['sets']), 9)
        self.assertEqual(exercises[0]['notes'], 'x' * 600)
        self.assertEqual(data['onboarding']['notes'], 'x' * 20000)

    async def test_invalid_date_order_is_not_hidden_by_padding(self):
        decision = route('none', 'training').model_copy(update={'start_date': date(2026, 9, 17), 'end_date': date(2026, 9, 16)})
        with patch.object(user_context, 'get_onboarding_response', return_value=None), \
             patch.object(user_context, 'get_calendar') as read:
            with self.assertRaises(ValueError):
                await user_context.load_user_context(CONTEXT, decision, TODAY)
        read.assert_not_called()

    async def test_chat_reuses_both_calendar_handlers_with_the_same_window_and_owner(self):
        with patch.object(user_context, 'get_onboarding_response', return_value=None), \
             patch.object(calendar, 'get_workouts_in_range', return_value=[]) as app, \
             patch.object(calendar, 'get_sports_workouts_in_range', return_value=[]) as sports:
            await user_context.load_user_context(CONTEXT, route('none', 'training'), TODAY)
        for read in [app, sports]:
            read.assert_called_once_with(CONTEXT.user_id, date(2026, 9, 11), date(2026, 9, 21), CONTEXT.access_token)

    def test_training_compaction_preserves_prescriptions_without_storage_metadata(self):
        data = user_context.compact_training({'workouts': [{'id': 'hidden', 'user_id': 'hidden',
            'name': 'squats', 'exercises': [{'created_at': 'hidden', 'name': 'squat',
                'sets': [{'exercise_id': 'hidden', 'planned_reps': 5, 'actual_weight': 100, 'planned_notes': 'x' * 600}]}]}]})
        self.assertNotIn('hidden', str(data))
        self.assertIn('planned_reps', str(data))
        self.assertIn('x' * 600, str(data))

    def test_nano_uses_native_structured_output_with_explicit_budgets(self):
        models.decision_model.cache_clear()
        self.addCleanup(models.decision_model.cache_clear)
        with patch.object(models, 'get_settings', return_value=SimpleNamespace(openai_api_key='test')), \
             patch.object(models, 'ChatOpenAI') as factory:
            models.decision_model(ChatRoute)
        self.assertEqual(factory.call_args.kwargs['model'], 'gpt-5-nano')
        self.assertEqual(factory.call_args.kwargs['max_retries'], 0)
        self.assertTrue(factory.call_args.kwargs['disable_streaming'])
        factory.return_value.with_structured_output.assert_called_once_with(ChatRoute, method='json_schema', strict=True)
        for schema in [ChatRoute, EvidenceReview]:
            self.assertEqual(set(schema.model_json_schema()['required']), set(schema.model_fields))
