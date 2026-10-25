import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.errors import NotFoundError
from chromadb.utils.embedding_functions import ChromaBm25EmbeddingFunction
from app.config import get_settings
from app.db.vector.ingestion import load_system_docs, split_docs
from app.db.vector.embeddings import MODEL_NAME, MODEL_REVISION, embed_research_documents
from tqdm import tqdm
from uuid import uuid4

class VectorDB:

    def __init__(self):
        self.settings = get_settings()
        self.client = chromadb.CloudClient(
            tenant=self.settings.chroma_tenant,
            database=self.settings.chroma_database,
            api_key=self.settings.chroma_api_key,
        )


    def __len__(self) -> int:
        try: return self.system_doc_count()
        except (ValueError, NotFoundError): return 0

    
    def system_doc_count(self) -> int:
        """ return indexed system document chunk count """
        return self.client.get_collection(self.settings.system_collection_name).count()


    def system_docs_ready(self) -> tuple[bool, int]:
        """ return whether the system collection exists and contains chunks """
        try:
            count = self.system_doc_count()
        except (ValueError, NotFoundError):
            return False, 0

        return count > 0, count


    def index_system_docs(self, batch_size: int | None = None) -> None:
        """ initialize system db """
        if batch_size is None:
            batch_size = self.settings.index_batch_size

        if batch_size < 1:
            raise ValueError("batch size must be positive")

        docs = load_system_docs()
        docs = split_docs(docs)
        if not docs or any(not doc.page_content.strip() for doc in docs):
            raise ValueError("research corpus must contain nonempty document chunks")

        system_db = self.reset_system_docs()

        for batch in tqdm(range(0, len(docs), batch_size), desc="submitting documents"):
            end = min(batch + batch_size, len(docs))
            texts = [doc.page_content for doc in docs[batch:end]]
            system_db.add(
                ids=[str(uuid4()) for _ in range(batch, end)],
                documents=texts,
                embeddings=embed_research_documents(texts),
                metadatas=[doc.metadata for doc in docs[batch:end]]
            )
    

    def reset_system_docs(self) -> Collection:
        """ reboot system db """
        schema = chromadb.Schema().create_index(key="sparse_embedding",
            config=chromadb.SparseVectorIndexConfig(source_key=chromadb.K.DOCUMENT,
                embedding_function=ChromaBm25EmbeddingFunction(), bm25=True))

        try:
            self.client.delete_collection(self.settings.system_collection_name)
        except (ValueError, NotFoundError):
            pass

        return self.client.create_collection(self.settings.system_collection_name, schema=schema,
            embedding_function=None, metadata={"embedding_model": MODEL_NAME, "embedding_revision": MODEL_REVISION})
    

    def get_system(self, id: str) -> dict:
        """ return context from id """
        system_db = self.client.get_collection(self.settings.system_collection_name)

        return system_db.get(id)
