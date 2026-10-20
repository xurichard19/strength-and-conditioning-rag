from types import ModuleType, SimpleNamespace
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock, patch
from uuid import UUID, uuid4

import fitz
import google.cloud
from chromadb.api.models.Collection import Collection
from chromadb.api.types import SparseVector
from chromadb.types import Collection as CollectionModel
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
        metadata = {"source": "gs://research/489cd9ad-7d53-4b34-8c56-6953edb2885c.pdf",
            "document_id": "489cd9ad-7d53-4b34-8c56-6953edb2885c", "title": "Training plans",
            "author": "A. Author", "doi": "none", "publication_year": "2024", "journal": "Training",
            "publisher": "Publisher", "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "copyright_notice": "Copyright the authors", "page": 1}
        chunks = [Document(page_content=f"chunk {i}", metadata=metadata) for i in range(3)]
        self.split.return_value = chunks
        self.db.index_system_docs()
        self.assertEqual([call[0] for call in calls.mock_calls], ["load", "split", "reset"])
        self.split.assert_called_once_with(self.load.return_value)
        self.assertEqual(self.collection.add.call_count, 2)
        batch_ids = [call.kwargs["ids"] for call in self.collection.add.call_args_list]
        self.assertEqual([len(ids) for ids in batch_ids], [2, 1])
        identifiers = [identifier for ids in batch_ids for identifier in ids]
        self.assertEqual(len(set(identifiers)), len(chunks))
        self.assertEqual([UUID(identifier).version for identifier in identifiers], [4] * len(chunks))
        self.assertNotIn(metadata["document_id"], identifiers)
        self.assertEqual(self.collection.add.call_args.kwargs["documents"], ["chunk 2"])
        self.assertEqual([item for call in self.collection.add.call_args_list for item in call.kwargs["metadatas"]],
            [metadata] * 3)

    def test_reset_keeps_collection_name_and_sdk_generates_keyword_vectors_from_chunk_text(self):
        self.db.settings.system_collection_name = "research"
        self.db.client = Mock()
        vector_store.VectorDB.reset_system_docs(self.db)
        self.db.client.delete_collection.assert_called_once_with("research")
        args = self.db.client.create_collection.call_args
        self.assertEqual(args.args, ("research",))
        schema = args.kwargs["schema"]
        index = schema.keys["sparse_embedding"].sparse_vector.sparse_vector_index
        self.assertTrue(index.enabled)
        self.assertTrue(index.config.bm25)
        self.assertEqual(index.config.source_key, "#document")

        client = Mock()
        model = CollectionModel(id=uuid4(), name="research", configuration_json={},
            serialized_schema=schema.serialize_to_json(), metadata=None, dimension=2, tenant="test", database="test")
        collection = Collection(client=client, model=model, embedding_function=None)
        metadata = {"document_id": str(uuid4()), "title": "Training plans", "author": "A. Author", "doi": "none"}
        documents = ["weekly undulating periodization improves squat strength", "walking and running recovery for endurance athletes"]
        collection.add(ids=[str(uuid4()), str(uuid4())], documents=documents,
            embeddings=[[.1, .2], [.2, .3]], metadatas=[metadata, metadata])
        submitted = client._add.call_args.kwargs
        self.assertEqual(submitted["documents"], documents)
        query = index.config.embedding_function.embed_query(["periodization"])[0]
        for position, values in enumerate(submitted["metadatas"]):
            self.assertEqual({field: values[field] for field in metadata}, metadata)
            vector = values["sparse_embedding"]
            self.assertIsInstance(vector, SparseVector)
            self.assertTrue(vector.indices)
            self.assertEqual(bool(set(query.indices) & set(vector.indices)), position == 0)
        self.assertNotIn("sparse_embedding", metadata)


class VectorIngestionTests(unittest.TestCase):
    def test_gcs_fields_override_embedded_pdf_metadata_and_survive_every_chunk(self):
        identifier = "489cd9ad-7d53-4b34-8c56-6953edb2885c"
        metadata = {"document_id": identifier, "title": "Training plans", "author": "Bucket author",
            "publication_year": "2024", "journal": "Training", "publisher": "Publisher",
            "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "copyright_notice": "Copyright the authors"}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "paper.pdf"
            with fitz.open() as pdf:
                pdf.set_metadata({"title": "Embedded title", "author": "Embedded author", "subject": "10.1234/embedded"})
                for number in range(2):
                    page = pdf.new_page()
                    page.insert_textbox(fitz.Rect(40, 40, 550, 800),
                        (f"page {number + 1} training guidance for recreational athletes. " * 40), fontsize=10)
                pdf.save(path)
            blob = SimpleNamespace(name=f"raw/system/{identifier}.pdf", metadata={**metadata, "extra": "ignored"},
                download_to_filename=lambda target: shutil.copyfile(path, target))
            client = SimpleNamespace(list_blobs=Mock(return_value=[blob]))
            with patch.object(ingestion.storage, "Client", return_value=client, create=True), \
                    patch.object(ingestion, "tqdm", side_effect=lambda values, **kwargs: values):
                pages = ingestion.load_system_docs_from_gcs("research", "/raw/system/")
                chunks = ingestion.split_docs(pages)
        expected = {**metadata, "doi": "none", "source": f"gs://research/{blob.name}"}
        self.assertEqual([page.metadata for page in pages], [{**expected, "page": 1}, {**expected, "page": 2}])
        self.assertGreater(len(chunks), len(pages))
        for chunk in chunks:
            self.assertEqual({key: value for key, value in chunk.metadata.items() if key not in ("page", "start_index")}, expected)
            self.assertIn(chunk.metadata["page"], (1, 2))
        client.list_blobs.assert_called_once_with("research", prefix="raw/system/")

    def test_failed_or_unreadable_gcs_document_does_not_return_a_partial_corpus(self):
        blobs = [SimpleNamespace(name=name, metadata=None, download_to_filename=Mock())
            for name in ("good.pdf", "bad.pdf")]
        client = SimpleNamespace(list_blobs=Mock(return_value=blobs))
        for failure in (ValueError("parse failed"), [], [Document(page_content=" ")]):
            with self.subTest(failure=failure), \
                    patch.object(ingestion.storage, "Client", return_value=client, create=True), \
                    patch.object(ingestion, "load_single_doc", side_effect=[[Document(page_content="good text")], failure]), \
                    patch.object(ingestion, "tqdm", side_effect=lambda values, **kwargs: values):
                with self.assertRaisesRegex(RuntimeError, "failed to load gs://research/bad.pdf"):
                    ingestion.load_system_docs_from_gcs("research", "")

    def test_short_chunks_from_different_pages_keep_their_page_numbers(self):
        pages = [Document(page_content=text, metadata={"source": "paper.pdf", "page": page})
            for page, text in enumerate(("short first page", "long second page " * 20, "short third page"), 1)]
        chunks = ingestion.split_docs(pages)
        self.assertEqual([chunk.metadata["page"] for chunk in chunks], [1, 2, 3])
        self.assertEqual([chunk.page_content for chunk in chunks], [page.page_content.strip() for page in pages])

    def test_same_filename_in_different_gcs_folders_cannot_merge_studies(self):
        names = ["a/review.pdf", "b/review.pdf"]
        texts = ["first study conclusion", "second study conclusion"]
        blobs = [SimpleNamespace(name=name, metadata=None, download_to_filename=Mock()) for name in names]
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
