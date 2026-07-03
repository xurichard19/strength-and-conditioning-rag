# Shingo: Strength & Conditioning RAG-based Assistant

Full-stack RAG assistant for athletes delivering research-backed training insights and planning using a two-stage retrieval pipeline (vector search + cross-encoder reranking) for higher accuracy. Document and vector storage using Google Cloud Storage and Chroma Cloud. Auth, database, and logging using Google Auth Platform, Supabase, and Sentry. Frontend deployed on Vercel and backend endpoints secured through VPS + Nginx.

---

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 25, 'rankSpacing': 40, 'curve': 'basis', 'subGraphTitleMargin': {'top': 8, 'bottom': 8}}}}%%
flowchart LR
    User(["User"]) --> FE["React frontend<br/>(Vite, Vercel)"]
    FE --> Nginx["Nginx<br/>reverse proxy"]
    Nginx --> API["FastAPI backend<br/>RAG orchestration"]

    API --> Retrieve["Vector search<br/>(Chroma Cloud)"]
    Retrieve --> Rerank["Rerank<br/>(Cohere cross-encoder)"]
    Rerank --> Gen["LLM generation<br/>grounded answer"]
    Gen --> API
    API --> FE

    API -.-> Auth[("Supabase<br/>auth & data")]
    API -.-> Log[("Sentry<br/>error/perf logging")]

    subgraph Ingestion["Offline indexing"]
        Docs[("GCS bucket<br/>source docs")] --> Index["index_system_docs.py"]
    end
    Index --> Retrieve

    style Ingestion fill:none,stroke-dasharray: 5 5
```

---

build api image from /
>> docker build -f server/Dockerfile -t shingo-backend .

run api behind nginx proxy from /
>> docker compose up --build proxy

---

run api server w/o proxy from /
>> docker compose up --build api-local

---

reindex with compose service
>> docker compose run --rm index

---

run client from /client
>> npm run dev
