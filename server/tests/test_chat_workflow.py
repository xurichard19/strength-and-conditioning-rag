import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from langchain_core.messages import AIMessage

from app.ai.workflows.chat.state import WorkflowContext


def load_workflow_file(path):
    """load the real workflow code in isolation without initializing external ai clients"""
    source = Path(__file__).parents[1] / 'app/ai/workflows/chat' / path
    spec = importlib.util.spec_from_file_location(f'progress_test_{source.stem}', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ChatWorkflowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict('os.environ', {'LANGSMITH_TRACING': 'false', 'LANGCHAIN_TRACING_V2': 'false'}))
        self.search_release = asyncio.Event()
        self.generate_release = asyncio.Event()
        self.calls = []

        async def search(query):
            self.calls.append(('search', query))
            await self.search_release.wait()
            return SimpleNamespace(results=[])

        async def generate(messages):
            self.calls.append(('generate', messages[-1].content))
            await self.generate_release.wait()
            return AIMessage(content='answer')

        with patch.dict('sys.modules', {'app.ai.services.search': SimpleNamespace(
                search_sources=search, format_sources_for_prompt=lambda sources: 'evidence')}), \
             patch('langchain.chat_models.init_chat_model', return_value=SimpleNamespace(ainvoke=generate)), \
             patch('app.config.get_settings', return_value=SimpleNamespace(openai_api_key='test')):
            search_node = load_workflow_file('nodes/search.py')
            generate_node = load_workflow_file('nodes/generate.py')
        with patch.dict('sys.modules', {
            'app.ai.workflows.chat.nodes.search': search_node,
            'app.ai.workflows.chat.nodes.generate': generate_node,
        }):
            self.workflow = load_workflow_file('graph.py')
        self.context = WorkflowContext(user_id='owner', access_token='private-token')

    async def test_node_status_arrives_before_its_blocked_work_completes(self):
        stream = self.workflow.stream_chat(self.workflow.build_chat_workflow(), 'question', self.context)
        try:
            self.assertEqual(await asyncio.wait_for(anext(stream), 2), {'type': 'status', 'stage': 'researching'})
            self.assertFalse(self.search_release.is_set())
            self.search_release.set()
            self.assertEqual(await asyncio.wait_for(anext(stream), 2), {'type': 'status', 'stage': 'thinking'})
            self.assertFalse(self.generate_release.is_set())
            self.generate_release.set()
            self.assertEqual([event async for event in stream], [{'type': 'text', 'delta': 'answer'},
                {'type': 'sources', 'sources': []}, {'type': 'done'}])
            self.assertEqual(self.calls, [('search', 'question'), ('generate', 'question')])
        finally:
            self.search_release.set()
            self.generate_release.set()
            await stream.aclose()

    async def test_adapter_keeps_progress_separate_from_answer_and_private_custom_events(self):
        async def parts(*args, **kwargs):
            self.assertIn('custom', kwargs['stream_mode'])
            yield {'type': 'custom', 'data': {'private': 'do not expose'}}
            yield {'type': 'messages', 'data': (AIMessage(content='private search text'), {'langgraph_node': 'search'})}
            yield {'type': 'custom', 'data': {'type': 'status', 'stage': 'thinking', 'private': 'do not expose'}}
            yield {'type': 'messages', 'data': (AIMessage(content='answer'), {'langgraph_node': 'generate'})}
        events = [event async for event in self.workflow.stream_chat(SimpleNamespace(astream=parts), 'question', self.context)]
        self.assertEqual(events, [{'type': 'status', 'stage': 'thinking'}, {'type': 'text', 'delta': 'answer'},
            {'type': 'sources', 'sources': []}, {'type': 'done'}])
