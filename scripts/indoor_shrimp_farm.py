import src.embed as m
from src.ingestion.load_parse_documents import load_documents
from src.ingestion.process_documents import process_documents
import random
import os
import pickle

"""
note: use pickle to avoid redoing complicated operations
"""

cache = 'data/processed/processed_doc.pkl'

data = None
if not os.path.exists(cache):
    print("processing from scratch...")
    docs = process_documents(load_documents())
    with open(cache, 'wb') as f:
        pickle.dump(docs, f)
    data = docs
else:
    print("loading data from memory...")
    with open(cache, 'rb') as f:
        data = pickle.load(f)

texts = [chunk['text'] for chunk in data]
indoorshrimpfarmer = m.get_embedding_model()
print(f"data: {len(data)}")
print(f"texts: {len(texts)}")
embeddings = m.embed_text(indoorshrimpfarmer, texts)
print(len(embeddings))
print([embeddings[:10]])
