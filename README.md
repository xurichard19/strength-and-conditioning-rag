# Shingo: Strength & Conditioning RAG-based Assistant

Full-stack RAG assistant for athletes delivering research-backed training insights using a two-stage retrieval pipeline (vector search + cross-encoder reranking) for higher accuracy.

---

current tech stack: figma -> react + vite + tailwindcss -> fastapi + firebase + gcs -> rag agent (langchain + chromadb + cohere rerank + openaiapi)

---

run backend docker build
>> docker build -t shingo-backend .

>> docker run --name shingo-api -p 8000:8000 --env-file .env shingo-backend

---

run frontend from /frontend
>> npm run dev
