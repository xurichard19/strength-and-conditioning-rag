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

### AI Workflows

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

#### Database Infrastructure

```mermaid
erDiagram
    direction LR

    AUTH_USERS ||--|| PROFILES : owns
    PROFILES ||--o| ONBOARDING_RESPONSES : completes
    PROFILES ||--o{ PLANNING_CHANGES : records
    PROFILES ||--o{ WORKOUTS : schedules
    PLANNING_CHANGES ||--o{ WORKOUTS : creates
    PLANNING_CHANGES o|--o{ WORKOUTS : supersedes
    PLANNING_CHANGES o|--o{ PLANNING_CHANGES : reverts
    WORKOUTS ||--o{ EXERCISES : contains
    EXERCISES ||--o{ EXERCISE_SETS : contains
    PROFILES ||--o{ MESSAGES : owns
    PROFILES ||--o{ SPORTS_WORKOUTS : schedules

    AUTH_USERS {
        uuid id PK
    }

    PROFILES {
        uuid id PK,FK
        text email
        text display_name
        text timezone
        timestamptz created_at
        timestamptz updated_at
    }

    ONBOARDING_RESPONSES {
        uuid user_id PK,FK
        jsonb answers
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    PLANNING_CHANGES {
        uuid id PK
        uuid user_id FK
        text reason
        date effective_from
        date horizon_end
        uuid reverts_change_id FK
        timestamptz created_at
    }

    WORKOUTS {
        uuid id PK
        uuid user_id FK
        uuid created_by_change_id FK
        date scheduled_date
        text name
        integer planned_duration_minutes
        text intent
        text status
        text notes
        timestamptz started_at
        timestamptz completed_at
        timestamptz skipped_at
        timestamptz superseded_at
        uuid superseded_by_change_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    EXERCISES {
        uuid id PK
        uuid workout_id FK
        integer order_index
        text name
        boolean reps_per_side
        text weight_unit
        text distance_unit
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    EXERCISE_SETS {
        uuid id PK
        uuid exercise_id FK
        integer order_index
        integer planned_reps
        numeric planned_weight
        numeric planned_distance
        integer planned_duration_seconds
        numeric planned_rpe
        integer planned_rest_seconds
        text planned_notes
        integer actual_reps
        numeric actual_weight
        numeric actual_distance
        integer actual_duration_seconds
        numeric actual_rpe
        text result_status
        text result_notes
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    MESSAGES {
        uuid id PK
        uuid user_id FK
        text role
        text content
        timestamptz created_at
    }

    SPORTS_WORKOUTS {
        uuid id PK
        uuid user_id FK
        text sport
        date scheduled_date
        time start_time
        integer planned_duration_minutes
        text intensity
        text status
        text notes
        timestamptz completed_at
        timestamptz cancelled_at
        timestamptz created_at
        timestamptz updated_at
    }
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
