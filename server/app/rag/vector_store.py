import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.errors import NotFoundError
from app.core.config import get_settings
from app.rag.ingestion import load_system_docs, split_docs
from tqdm import tqdm

class VectorDB:

    def __init__(self):
        self.settings = get_settings()
        self.client = chromadb.CloudClient(
            tenant=self.settings.chroma_tenant,
            database=self.settings.chroma_database,
            api_key=self.settings.chroma_api_key,
        )


    def __len__(self) -> int:
        try: return self.client.get_collection(self.settings.system_collection_name).count()
        except (ValueError, NotFoundError): return 0

    
    def upsert_document(self):
        #...
        pass
    

    def index_system_docs(self, batch_size: int | None = None) -> None:
        """ initialize system db """
        if batch_size is None:
            batch_size = self.settings.index_batch_size

        system_db = self.reset_system_docs()

        docs = load_system_docs()
        docs = split_docs(docs)

        for batch in tqdm(range(0, len(docs), batch_size), desc="submitting documents"):
            end = min(batch + batch_size, len(docs))
            system_db.add(
                ids=[str(i) for i in range(batch + 1000, end + 1000)],
                documents=[doc.page_content for doc in docs[batch:end]],
                metadatas=[doc.metadata for doc in docs[batch:end]]
            )
    

    def query_system_docs(self, query: str, top_k: int | None = None) -> dict:
        """ return top k similar contexts from chromadb by l2 norm for a single query """
        if top_k is None:
            top_k = self.settings.retrieval_top_k

        system_db = self.client.get_collection(self.settings.system_collection_name) # chromadb will bubble up notfound error

        response = system_db.query(query_texts=[query], n_results=top_k)

        # unwrap outer list
        for key in response.keys():
            if response[key]: response[key] = response[key][0]

        return response
        # maybe cut chunks that dont meet a threshold similarity score?
    
    
    def reset_system_docs(self) -> Collection:
        """ reboot system db """
        try:
            self.client.delete_collection(self.settings.system_collection_name)
        except (ValueError, NotFoundError):
            pass

        return self.client.create_collection(self.settings.system_collection_name)
    

    def get_system(self, id: str) -> dict:
        """ return context from id """
        system_db = self.client.get_collection(self.settings.system_collection_name)

        return system_db.get(id)
