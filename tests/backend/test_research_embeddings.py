from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import sleep
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import numpy as np

from app.db.vector import embeddings


class ResearchEmbeddingTests(unittest.TestCase):
    def test_concurrent_first_requests_share_one_cached_model(self):
        model = object()
        barrier = Barrier(2)

        def construct(*args, **kwargs):
            sleep(.02)
            return model

        factory = Mock(side_effect=construct)

        def request():
            barrier.wait()
            return embeddings.research_model()

        with patch.object(embeddings, "_model", None), \
                patch.dict("sys.modules", {"sentence_transformers": SimpleNamespace(SentenceTransformer=factory)}), \
                ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(request) for _ in range(2)]
            self.assertEqual([future.result() for future in futures], [model, model])
            self.assertIs(embeddings.research_model(), model)

        factory.assert_called_once_with(embeddings.MODEL_NAME, revision=embeddings.MODEL_REVISION, device="cpu")

    def test_document_and_query_vectors_share_model_and_only_queries_get_the_instruction(self):
        model = SimpleNamespace(encode=Mock(return_value=np.array([[.6, .8]])))
        with patch.object(embeddings, "_model", model):
            self.assertEqual(embeddings.embed_research_documents([" training\n  plan "]), [[.6, .8]])
            self.assertEqual(embeddings.embed_research_queries([" training\n  plan "]), [[.6, .8]])

        calls = model.encode.call_args_list
        self.assertEqual(calls[0].args[0], ["training plan"])
        self.assertEqual(calls[1].args[0], [embeddings.QUERY_PROMPT + "training plan"])
        self.assertTrue(all(call.kwargs["normalize_embeddings"] for call in calls))
        self.assertTrue(all(call.kwargs["batch_size"] == 32 for call in calls))
