import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.errors import NotFoundError
import os
from shingo.documenthandler import load_system_docs, split_docs
from tqdm import tqdm

class VectorDB:

    def __init__(self, path=os.path.join('data', 'vectordb')):
        self.client = chromadb.PersistentClient(path) # use cloudclient during production


    def __len__(self) -> int:
        try: return self.client.get_collection("system-docs").count()
        except (ValueError, NotFoundError): return 0

    
    def upsert_document(self):
        #...
        pass
    

    def index_system_docs(self, batch_size=1000) -> None:
        """ initialize system db """
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
    

    def query_system_docs(self, query: str, top_k=7) -> dict:
        """ return top k similar contexts from chromadb by l2 norm for a single query """
        system_db = self.client.get_collection("system-docs") # chromadb will bubble up notfound error

        response = system_db.query(query_texts=[query], n_results=top_k)

        # unwrap outer list
        for key in response.keys():
            if response[key]: response[key] = response[key][0]

        return response
        # maybe cut chunks that dont meet a threshold similarity score?
    
    
    def reset_system_docs(self) -> Collection:
        """ reboot system db """
        try:
            self.client.delete_collection("system-docs")
        except (ValueError, NotFoundError):
            pass

        return self.client.create_collection("system-docs")