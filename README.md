# Arcel: Strength & Conditioning Assistant

note: web client depreciated, mobile client currently in development

Arcel is a full-stack assistant for hybrid athletes building strength and conditioning programs around sport-specific demands. It answers conversational and research-backed training questions using more than 300 CC BY 4.0 research papers, live web search, and streamed LLM generation.

The Expo/React Native mobile client connects to the containerized FastAPI backend running on Google Cloud Run behind Google Cloud Load Balancing and Cloud Armor. The backend uses LangGraph for request-level workflow orchestration, a LangChain search agent for evidence gathering, OpenAI for model inference, Chroma Cloud for research retrieval, Tavily for web search, Cohere for reranking, and Supabase for authentication and application data.

---
#### App Infrastructure
```mermaid
flowchart TB
    User(["User"]) --> FE["React Native mobile client<br/>Expo"]
    FE --> Edge["Google Cloud edge<br/>Load Balancer and<br/>Cloud Armor"]
    Edge --> API["FastAPI backend<br/>Cloud Run"]
    API --> Workflows["LangGraph workflows<br/>chat and plan"]
    API --> Supabase[("Supabase<br/>authentication<br/>and data")]
    API --> Sentry["Sentry<br/>monitoring"]
    Workflows --> OpenAI["OpenAI"]
    Workflows --> Chroma[("Chroma Cloud<br/>research index")]
    Workflows --> SearchServices["Tavily and<br/>Cohere"]
    Workflows --> LangSmith["LangSmith<br/>tracing"]
    Docs[("GCS source<br/>documents")] --> Index["Offline<br/>indexing"]
    Index --> Chroma
```

#### Chat LangGraph Workflow

```mermaid
flowchart TB
    Request["Chat request"] --> Search["Search node"]
    Search --> Agent["LangChain agent<br/>OpenAI search"]
    Agent --> Chroma[("Chroma Cloud<br/>research index")]
    Agent --> Tavily["Tavily<br/>web search"]
    Agent --> Cohere["Cohere reranker<br/>research only"]
    Agent --> Evidence["Selected<br/>evidence"]
    Evidence --> Generate["Generation node<br/>OpenAI"]
    Generate --> Stream["NDJSON<br/>response stream"]
```

#### Workout Programming LangGraph Workflow

```mermaid
flowchart TB
    Request["Plan request<br/>and user profile"] --> Rewrite["Rewrite node<br/>OpenAI"]
    Rewrite --> Search["Search node"]
    Search --> Agent["LangChain agent<br/>OpenAI search"]
    Agent --> Chroma[("Chroma Cloud<br/>research index")]
    Agent --> Tavily["Tavily<br/>web search"]
    Agent --> Cohere["Cohere reranker<br/>research only"]
    Agent --> Evidence["Selected<br/>evidence"]
    Evidence --> Generate["Plan generation<br/>OpenAI"]
    Generate --> Plan["Structured<br/>WorkoutPlan"]
```

---

### Local development services

build api image from /
>> docker build -f server/Dockerfile -t arcel-backend .

run api server from /
>> docker compose up --build api

reindex with compose service
>> docker compose run --rm index

run mobile client from /mobile
>> npm start
