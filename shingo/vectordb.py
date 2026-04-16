import chromadb
import os
from shingo.documenthandler import load_system_docs, split_docs
from tqdm import tqdm

class VectorDB:

    def __init__(self, path=os.path.join('data', 'vectordb')):
        self.client = chromadb.PersistentClient(path) # use cloudclient during production
        self.system_docs = self.client.get_or_create_collection("system-docs")


    def __len__(self) -> int:
        return self.system_docs.count()


    def index_system_docs(self, batch_size=1000) -> bool:
        """ initialize system db """
        docs = load_system_docs()
        docs = split_docs(docs)

        for batch in tqdm(range(0, len(docs), 1000), desc="submitting documents"):
            end = min(batch + batch_size, len(docs))
            self.system_docs.add(
                ids=[str(i) for i in range(batch + 1000, end + 1000)], # edit for stable ids i.e. <source> <chunk>
                documents=[doc.page_content for doc in docs[batch:end]],
                metadatas=[doc.metadata for doc in docs[batch:end]]
            )

        return True
    

    def query_system_docs(self, query: str, top_k=3) -> dict:
        """ return top k similar contexts from chromadb by l2 norm for a single query """
        response = self.system_docs.query(query_texts=[query], n_results=top_k)

        # unwrap outer list
        for key in response.keys():
            if response[key]: response[key] = response[key][0]

        return response
    
    
    def reset_system_docs(self):
        """ reboot system db """
        self.client.delete_collection("system-docs")
        self.system_docs = self.client.get_or_create_collection("system-docs")