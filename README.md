# Shingo: Strength & Conditioning RAG-based Assistant

Full-stack RAG assistant for athletes delivering research-backed training insights using a two-stage retrieval pipeline (vector search + cross-encoder reranking) for higher accuracy.

---

current tech stack: figma -> react + vite + tailwindcss -> fastapi + firebase + gcs -> rag agent (langchain + chromadb + cohere rerank + openaiapi)

---

run backend docker build
>> docker build -t shingo-backend .

>> docker compose up api

run in a separate terminal when reindexing

>> docker compose run --rm index

---

run frontend from /frontend
>> npm run dev
