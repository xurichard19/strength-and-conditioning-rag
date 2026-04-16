from shingo.vectordb import VectorDB

db = VectorDB()
print(len(db))

print()

db.reset_system_docs()
print(len(db))
db.index_system_docs()
print(len(db))

"""res = db.query_system_docs("197 Chapter 5")
print(res)"""