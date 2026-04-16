from shingo.vectordb import VectorDB

db = VectorDB()
db.index_system_docs()

print("successfully initialized system")