# Shingo: Strength & Conditioning RAG-based Assistant

Full-stack RAG assistant for athletes delivering research-backed training insights using a two-stage retrieval pipeline (vector search + cross-encoder reranking) for higher accuracy. Document and vector storage using Google Cloud Storage and Chroma Cloud.

---

current tech stack: figma -> react + vite + tailwindcss -> fastapi + gcs -> rag agent (langchain + chroma cloud + cohere rerank + openaiapi)

---

run server docker build
>> docker build -t shingo-backend .

>> docker compose up api

run in a separate terminal when reindexing

>> docker compose run --rm index

---

run client from /client
>> npm run dev
