# Arcel: Strength & Conditioning Assistant

Arcel is a full-stack assistant for hybrid athletes building strength and conditioning programs around sport-specific demands. It answers conversational and research-backed training questions using more than 300 CC BY 4.0 research papers, live web search, and streamed LLM generation.

The React/Vite frontend is deployed on Vercel, while the containerized FastAPI backend runs on Google Cloud Run behind Google Cloud Load Balancing and Cloud Armor. The backend uses LangGraph for request-level workflow orchestration, a LangChain search agent for evidence gathering, OpenAI for model inference, Chroma Cloud for research retrieval, Tavily for web search, Cohere for optional research-only reranking, and Supabase for authentication and application data.

---
#### App Infrastructure
```mermaid
flowchart TB
    User(["User"]) --> FE["React frontend on Vercel"]
    FE --> Edge["Google Cloud load balancer and Cloud Armor"]
    Edge --> API["FastAPI backend on Cloud Run"]
    API --> Workflows["LangGraph chat and plan workflows"]
    API --> Supabase[("Supabase authentication and data")]
    API --> Sentry["Sentry monitoring"]
    Workflows --> OpenAI["OpenAI"]
    Workflows --> Chroma[("Chroma Cloud research index")]
    Workflows --> SearchServices["Tavily and Cohere"]
    Workflows --> LangSmith["LangSmith tracing"]
    Docs[("GCS source documents")] --> Index["Offline indexing"]
    Index --> Chroma
```

#### Chat LangGraph Workflow

```mermaid
flowchart TB
    Request["Chat request"] --> Search["Search node"]
    Search --> Agent["LangChain search agent using OpenAI"]
    Agent --> Chroma[("Chroma Cloud research index")]
    Agent --> Tavily["Tavily web search"]
    Agent --> Cohere["Cohere research reranker"]
    Agent --> Evidence["Selected evidence"]
    Evidence --> Generate["OpenAI generation node"]
    Generate --> Stream["NDJSON response stream"]
```

#### Workout Programming LangGraph Workflow

```mermaid
flowchart TB
    Request["Plan request and user profile"] --> Rewrite["OpenAI rewrite node"]
    Rewrite --> Search["Search node"]
    Search --> Agent["LangChain search agent using OpenAI"]
    Agent --> Chroma[("Chroma Cloud research index")]
    Agent --> Tavily["Tavily web search"]
    Agent --> Cohere["Cohere research reranker"]
    Agent --> Evidence["Selected evidence"]
    Evidence --> Generate["OpenAI plan generation node"]
    Generate --> Plan["Structured WorkoutPlan"]
```

---

### Local development services

build api image from /
>> docker build -f server/Dockerfile -t arcel-backend .

run api server from /
>> docker compose up --build api

reindex with compose service
>> docker compose run --rm index

run client from /client
>> npm run dev
