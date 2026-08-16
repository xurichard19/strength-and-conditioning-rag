# Arcel: Strength & Conditioning Assistant

Arcel is a full-stack assistant for hybrid athletes building strength and conditioning programs around sport-specific demands. It answers conversational and research-backed training questions using more than 300 CC BY 4.0 research papers, live web search, and streamed LLM generation.

The React/Vite frontend is deployed on Vercel, while the containerized FastAPI backend runs on Google Cloud Run behind Google Cloud Load Balancing and Cloud Armor. The backend uses LangGraph for request-level workflow orchestration, a LangChain search agent for evidence gathering, OpenAI for model inference, Chroma Cloud for research retrieval, Tavily for web search, Cohere for optional research-only reranking, and Supabase for authentication and application data.

---
#### App Infrastructure
```mermaid
flowchart LR
    User(["User"]) --> FE["React frontend<br/>(Vite, Vercel)"]
    FE --> Edge["Google Cloud edge<br/>load balancer + Cloud Armor"]
    Edge --> API["FastAPI backend<br/>(Cloud Run)"]

    API --> Workflows["LangGraph workflows<br/>chat + plan"]
    Workflows --> AI["AI and search services<br/>OpenAI + Chroma + Tavily + Cohere"]
    API -.-> Supabase[("Supabase<br/>auth and data")]
    API -.-> Sentry["Sentry<br/>errors and API performance"]
    Workflows -.-> LangSmith["LangSmith<br/>LLM and workflow traces"]

    subgraph Ingestion["Offline indexing"]
        Docs[("GCS bucket<br/>source documents")] --> Index["index_system_docs.py"]
    end
    Index --> AI
```

#### Chat LangGraph Workflow

```mermaid
flowchart LR
    Request["Chat request"] --> Search["Search node"]
    Search --> Agent["LangChain search agent<br/>(OpenAI)"]
    Agent --> Chroma[("Chroma Cloud<br/>research index")]
    Agent --> Tavily["Tavily web search"]
    Agent -. "research only" .-> Cohere["Cohere reranker"]
    Agent --> Evidence["Selected evidence"]
    Evidence --> Generate["Generation node<br/>(OpenAI)"]
    Generate --> Stream["NDJSON response stream"]
```

#### Workout Programming LangGraph Workflow

```mermaid
flowchart LR
    Request["Plan request + user profile"] --> Rewrite["Rewrite node<br/>(OpenAI)"]
    Rewrite --> Search["Search node"]
    Search --> Agent["LangChain search agent<br/>(OpenAI)"]
    Agent --> Chroma[("Chroma Cloud<br/>research index")]
    Agent --> Tavily["Tavily web search"]
    Agent -. "research only" .-> Cohere["Cohere reranker"]
    Agent --> Evidence["Selected evidence"]
    Evidence --> Generate["Plan generation node<br/>(OpenAI)"]
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
