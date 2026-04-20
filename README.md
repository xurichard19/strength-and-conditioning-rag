# Shingo: Strength & Conditioning RAG-based Assistant

current tech stack: figma -> react + vite + tailwindcss -> fastapi + firebase -> rag agent (langchain + chromadb + openaiapi)

lifecycle: implemented ingestion -> implemented retrieval -> implemented generation -> ui and api setup -> **dockerizing** -> move to gcs -> implement figma design -> deploy

---

run backend docker build (early testing ver.)
>> docker build -t shingo-backend .

>> docker run --name shingo-api -p 8000:8000 shingo-backend

---

run frontend from /frontend
>> npm run dev