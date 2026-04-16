from langchain_community.document_loaders import PyMuPDFLoader, UnstructuredPowerPointLoader
import os
import pickle
from shingo.ingestion import VectorDB
import random

cache = os.path.join('data', 'processed', 'db_test.pkl')

if not os.path.exists(cache):
    print("creating db...")
    db = VectorDB()
    with open(cache, "wb") as f:
        pickle.dump(db, f)
else:
    print("loading db from memory...\n")
    with open(cache, 'rb') as f:
        db = pickle.load(f)

print(len(db.docs))
print(len(db.chunks))
print(db.chunks[2894])