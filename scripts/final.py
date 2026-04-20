from dotenv import load_dotenv
load_dotenv()

from shingo.vectordb import VectorDB
from shingo.rag_pipline import answer_question

db = VectorDB()
db.index_system_docs()
print(len(db))

print(answer_question("what are the best ways like exercises to improve my rate of force development", db))