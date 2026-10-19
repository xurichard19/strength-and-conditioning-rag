from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import google.cloud
from langchain_core.documents import Document

try:
    from google.cloud import storage
except ImportError:
    storage = ModuleType("google.cloud.storage")

# These tests replace corpus reads; importing the optional GCS SDK is unnecessary.
with patch.object(google.cloud, "storage", storage, create=True):
    from app.db.vector import ingestion, vector_store


class VectorIndexingTests(unittest.TestCase):
    def setUp(self):
        self.db = vector_store.VectorDB.__new__(vector_store.VectorDB)
        self.db.settings = SimpleNamespace(index_batch_size=2)
        self.collection = Mock()
        self.reset = self.enterContext(patch.object(self.db, "reset_system_docs", return_value=self.collection))
        self.load = self.enterContext(patch.object(vector_store, "load_system_docs"))
        self.split = self.enterContext(patch.object(vector_store, "split_docs"))
        self.enterContext(patch.object(vector_store, "tqdm", side_effect=lambda values, **kwargs: values))

    def test_source_loading_or_splitting_failure_preserves_existing_collection(self):
        for operation in (self.load, self.split):
            with self.subTest(operation=operation):
                operation.side_effect = ValueError("invalid source")
                with self.assertRaisesRegex(ValueError, "invalid source"):
                    self.db.index_system_docs()
                self.reset.assert_not_called()
                self.collection.add.assert_not_called()
                operation.side_effect = None

    def test_empty_or_blank_corpus_preserves_existing_collection(self):
        for chunks in ([], [Document(page_content="  ")]):
            with self.subTest(chunks=chunks):
                self.split.return_value = chunks
                with self.assertRaisesRegex(ValueError, "nonempty document chunks"):
                    self.db.index_system_docs()
                self.reset.assert_not_called()
                self.collection.add.assert_not_called()

    def test_invalid_batch_size_preserves_existing_collection_without_loading(self):
        for batch_size in (0, -1):
            with self.subTest(batch_size=batch_size), self.assertRaisesRegex(ValueError, "batch size"):
                self.db.index_system_docs(batch_size)
        self.load.assert_not_called()
        self.reset.assert_not_called()

    def test_valid_corpus_is_prepared_before_reset_then_indexed_in_batches(self):
        calls = Mock()
        for name, mock in (("load", self.load), ("split", self.split), ("reset", self.reset)):
            calls.attach_mock(mock, name)
        chunks = [Document(page_content=f"chunk {i}", metadata={"source": "paper.pdf"}) for i in range(3)]
        self.split.return_value = chunks
        self.db.index_system_docs()
        self.assertEqual([call[0] for call in calls.mock_calls], ["load", "split", "reset"])
        self.split.assert_called_once_with(self.load.return_value)
        self.assertEqual(self.collection.add.call_count, 2)
        self.assertEqual([call.kwargs["ids"] for call in self.collection.add.call_args_list], [["1000", "1001"], ["1002"]])
        self.assertEqual(self.collection.add.call_args.kwargs["documents"], ["chunk 2"])
        self.assertEqual(self.collection.add.call_args.kwargs["metadatas"], [{"source": "paper.pdf"}])


class VectorIngestionTests(unittest.TestCase):
    def test_same_filename_in_different_gcs_folders_cannot_merge_studies(self):
        names = ["a/review.pdf", "b/review.pdf"]
        texts = ["first study conclusion", "second study conclusion"]
        blobs = [SimpleNamespace(name=name, download_to_filename=Mock()) for name in names]
        client = SimpleNamespace(list_blobs=Mock(return_value=blobs))
        with patch.object(ingestion.storage, "Client", return_value=client, create=True), \
                patch.object(ingestion, "load_single_doc", side_effect=[
                    [Document(page_content=text)] for text in texts]), \
                patch.object(ingestion, "tqdm", side_effect=lambda values, **kwargs: values):
            chunks = ingestion.split_docs(ingestion.load_system_docs_from_gcs("research", ""))
        self.assertEqual([chunk.page_content for chunk in chunks], texts)
        self.assertEqual([chunk.metadata["source"] for chunk in chunks],
            [f"gs://research/{name}" for name in names])
        client.list_blobs.assert_called_once_with("research", prefix=None)
