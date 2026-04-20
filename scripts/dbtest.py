from shingo.vectordb import VectorDB

db = VectorDB()
print(len(db))

print()

res = db.query_system_docs("272 Chapter 7 Conclusions")
print(res.keys())
print()
l = [doc for doc in res['documents']]
for i in l:
    print([i])
    print()