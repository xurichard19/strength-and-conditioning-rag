# Shingo: Strength & Conditioning RAG-based Assistant

Full-stack RAG assistant for athletes delivering research-backed training insights and planning using a two-stage retrieval pipeline (vector search + cross-encoder reranking) for higher accuracy. Document and vector storage using Google Cloud Storage and Chroma Cloud. Auth, database, and logging using Google Auth Platform, Supabase, and Sentry. Frontend deployed on Vercel and backend endpoints secured through VPS + Nginx.

---

current tech stack: figma -> react + vite + tailwind -> docker -> nginx -> fastapi + gcp + supabase + sentry -> rag agent (langchain + chroma cloud + cohere rerank + openaiapi)

---

build api image from /
>> docker build -f server/Dockerfile -t shingo-backend .

run api behind nginx proxy from /
>> docker compose up --build proxy

available at `http://localhost:8000`

---

run api server w/o proxy from /
>> docker compose up --build api-local

available at `http://localhost:8000`

note: `proxy` and `api-local` both use host port `8000`; run one or the other.

---

reindex with compose service
>> docker compose run --rm index

---

backend deployment preflight

- set `ENVIRONMENT=production` for deployed backend containers so development-only endpoints stay disabled.
- set backend secrets in the deployment platform secret store, not in committed files. Avoid sharing `docker compose config` output because it expands `.env` values.
- required backend runtime env vars: `OPENAI_API_KEY`, `COHERE_API_KEY`, `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`.
- optional backend runtime env vars: `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `APP_NAME`, and `CORS_ORIGINS`.
- keep `CORS_ORIGINS` as JSON, for example `["http://localhost:5173","https://shingoassist.vercel.app"]`.
- normal `/chat/` and `/plan/generate` requests use Chroma, Cohere, OpenAI, Supabase, and optional Sentry. They do not read from GCS.
- GCS credentials are required for indexing and upload jobs only: `docker compose run --rm index` and `server/scripts/upload_to_gcs.py`.
- before sending production traffic, confirm the Chroma `system-docs` collection is indexed: `/ready` should return `200` with a positive `system_document_chunks` count.
- `/health` is a lightweight container liveness check; `/ready` is the Chroma/index readiness check.
- set the deployed frontend's `VITE_API_BASE_URL` to the backend origin.
- TLS is still required for production traffic. Use platform-managed HTTPS if the backend is deployed to a PaaS, or terminate HTTPS at Nginx/Caddy/load balancer if using a VPS.

---

run client from /client
>> npm run dev
