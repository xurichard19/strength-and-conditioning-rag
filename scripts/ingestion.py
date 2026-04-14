# run from root dir with >> python -m scripts.ingestion

from src.ingestion.load_parse_documents import load_documents
from src.ingestion.process_documents import process_documents
import random

docs = load_documents()
processed = process_documents(docs)

# create test documents

print(len(processed))
for i in range(10):
    idx = random.randint(0,len(processed))
    print(processed[idx])
    print()