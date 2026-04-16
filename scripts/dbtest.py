from shingo.vectordb import VectorDB

db = VectorDB()
print(len(db))

print()

db.index_system_docs()
print(len(db))