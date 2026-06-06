# Shingo: Strength & Conditioning RAG-based Assistant

Full-stack RAG assistant for athletes delivering research-backed training insights using a two-stage retrieval pipeline (vector search + cross-encoder reranking) for higher accuracy. Document and vector storage using Google Cloud Storage and Chroma Cloud. Frontend deployed on Vercel and backend endpoints secured through VPS + Nginx.

---

current tech stack: figma -> react + vite + tailwindcss -> docker compose + nginx -> fastapi + gcs -> rag agent (langchain + chroma cloud + cohere rerank + openaiapi)

---

run server build from /
>> docker build -f server/Dockerfile -t shingo-backend .

run api behind nginx proxy from /
>> docker compose up --build proxy

reindex with compose service
>> docker compose run --rm index

---

run client from /client
>> npm run dev
