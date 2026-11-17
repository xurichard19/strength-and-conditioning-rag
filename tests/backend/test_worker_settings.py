"""Background generation must not depend on public API webhook credentials."""

import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from app import config, http
from app.ai.services import search
from app.ai.workflows.chat import models as chat_models
from app.ai.workflows.chat.state import ChatRoute
from app.ai.workflows.plan import models as plan_models
from app.ai.workflows.plan.state import SearchQuery
from app.jobs import replan_worker, scheduler


WORKER_ENV = {
    'ENVIRONMENT': 'test', 'BILLING_ENABLED': 'true',
    'SUPABASE_URL': 'https://test.invalid', 'SUPABASE_PUBLISHABLE_KEY': 'public',
    'SUPABASE_SECRET_KEY': 'db-secret', 'REVENUECAT_API_KEY': 'revenuecat-server-key',
    'CHROMA_TENANT': 'tenant', 'CHROMA_DATABASE': 'database', 'CHROMA_API_KEY': 'chroma-key',
    'OPENAI_API_KEY': 'openai-key', 'COHERE_API_KEY': 'cohere-key', 'TAVILY_API_KEY': 'tavily-key',
}


class WorkerSettingsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict('os.environ', WORKER_ENV, clear=True))
        self.enterContext(patch.object(http, 'close_http_client'))
        for cached in (config.get_settings, config.get_ai_settings, config.get_billing_settings,
                       plan_models.decision_model, plan_models.generation_model,
                       chat_models.decision_model, chat_models.answer_model,
                       search.web_search_client, search.rerank_client):
            cached.cache_clear()
            self.addCleanup(cached.cache_clear)

    async def test_paid_worker_initializes_models_and_search_without_webhook_configuration(self):
        with self.assertRaisesRegex(ValidationError, 'revenuecat_webhook_authorization'):
            config.get_settings()
        async with replan_worker.app.router.lifespan_context(replan_worker.app):
            self.assertTrue(config.get_ai_settings().billing_enabled)
            with patch.object(plan_models, 'ChatOpenAI') as plan_factory, \
                    patch.object(chat_models, 'ChatOpenAI') as chat_factory, \
                    patch.object(search, 'TavilySearch') as web_factory, \
                    patch.object(search.cohere, 'AsyncClientV2') as rerank_factory:
                plan_models.decision_model(SearchQuery)
                plan_models.generation_model()
                chat_models.decision_model(ChatRoute)
                chat_models.answer_model()
                search.web_search_client(5)
                search.rerank_client()
            self.assertEqual([call.kwargs['api_key'] for call in plan_factory.call_args_list], ['openai-key'] * 2)
            self.assertEqual([call.kwargs['api_key'] for call in chat_factory.call_args_list], ['openai-key'] * 2)
            self.assertEqual(web_factory.call_args.kwargs['tavily_api_key'], 'tavily-key')
            self.assertEqual(rerank_factory.call_args.kwargs['api_key'], 'cohere-key')

            collection = SimpleNamespace(metadata={'embedding_model': search.MODEL_NAME})
            client = SimpleNamespace(get_collection=AsyncMock(return_value=collection))
            with patch.object(search, '_collection', None), \
                    patch.object(search, '_collection_lock', asyncio.Lock()), \
                    patch.object(search.chromadb, 'AsyncHttpClient', new=AsyncMock(return_value=client)) as chroma:
                self.assertIs(await search.research_collection(), collection)
            self.assertEqual(chroma.call_args.kwargs['headers'], {'x-chroma-token': 'chroma-key'})

    async def test_missing_payment_provider_credentials_reject_both_job_services_at_startup(self):
        with patch.dict('os.environ', {key: value for key, value in WORKER_ENV.items()
                if key != 'REVENUECAT_API_KEY'}, clear=True):
            for app in (scheduler.app, replan_worker.app):
                with self.subTest(service=app.title), self.assertRaisesRegex(ValidationError, 'revenuecat_api_key'):
                    async with app.router.lifespan_context(app):
                        self.fail('job service accepted an incomplete billing configuration')

    async def test_dispatcher_needs_no_ai_credentials_but_worker_rejects_them_at_startup(self):
        with patch.dict('os.environ', {key: value for key, value in WORKER_ENV.items()
                if key not in {'OPENAI_API_KEY', 'COHERE_API_KEY', 'TAVILY_API_KEY', 'CHROMA_API_KEY'}}, clear=True):
            async with scheduler.app.router.lifespan_context(scheduler.app):
                self.assertTrue(config.get_billing_settings().billing_enabled)
            with self.assertRaisesRegex(ValidationError, 'openai_api_key'):
                async with replan_worker.app.router.lifespan_context(replan_worker.app):
                    self.fail('worker accepted an incomplete generation configuration')
