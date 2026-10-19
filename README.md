# Arcel: Strength & Conditioning Assistant

note: web client depreciated, mobile client currently in development

Arcel is a full-stack assistant for hybrid athletes building strength and conditioning programs around sport-specific demands. It answers conversational and research-backed training questions using more than 300 CC BY 4.0 research papers, live web search, and streamed LLM generation.

The Expo/React Native mobile client connects to the containerized FastAPI backend running on Google Cloud Run behind Google Cloud Load Balancing and Cloud Armor. The backend uses LangGraph for request-level workflow orchestration, deterministic evidence retrieval with bounded chat search retries, OpenAI for model inference, Chroma Cloud for research retrieval, Tavily for web search, and Supabase for authentication and application data. Cohere reranking and hybrid retrieval are available separately but are not part of the active chat workflow. GitHub Actions runs the tests before building and pushing backend images to Google Artifact Registry, deploying them to Cloud Run, and verifying backend health.

#### Table of Contents

- [Mobile App Demo](#mobile-app-demo)
- [App Infrastructure](#app-infrastructure)
- [Chat LangGraph Workflow](#chat-langgraph-workflow)
- [Workout Programming LangGraph Workflow](#workout-programming-langgraph-workflow)
- [Database Infrastructure](#database-infrastructure)
- [Local Development Services](#local-development-services)

---

#### Mobile App Demo

https://github.com/user-attachments/assets/b91a3d4c-24e4-497a-b0c3-b5eb1353975a

#### App Infrastructure
```mermaid
flowchart TB
    User(["User"]) --> FE["React Native mobile client<br/>Expo"]
    FE --> Edge["Google Cloud edge<br/>Load Balancer and<br/>Cloud Armor"]
    Edge --> API["FastAPI backend<br/>Cloud Run"]
    API -->|chat| Workflows["LangGraph workflows<br/>chat and plan"]
    API -.->|Cloud Tasks| Worker["Planning worker<br/>Cloud Run"]
    Worker -->|plan| Workflows
    API --> Supabase[("Supabase<br/>authentication<br/>and data")]
    API --> Sentry["Sentry<br/>monitoring"]
    Workflows --> OpenAI["OpenAI"]
    Workflows --> Chroma[("Chroma Cloud<br/>research index")]
    Workflows --> SearchServices["Tavily<br/>web search"]
    Workflows --> LangSmith["LangSmith<br/>tracing"]
    Docs[("GCS source<br/>documents")] --> Index["Offline<br/>indexing"]
    Index --> Chroma
    API -.- ci["GitHub Actions<br/>deployment"]
```

##### Programming Infrastructure

```mermaid
flowchart TB
    Inputs["Onboarding completion / edits<br/>Sports changes"] --> API["FastAPI backend<br/>Cloud Run"]
    API -->|persist inputs and scheduling changes| DB[("Supabase<br/>21-day coverage · 7-day refreshes<br/>Durable jobs · calendar · history")]
    Clock["Cloud Scheduler<br/>Every minute"] -->|OIDC POST /dispatch| Dispatcher["Private dispatcher<br/>Cloud Run"]
    Dispatcher <-->|due refreshes and delivery recovery| DB
    Dispatcher --> Queue["Cloud Tasks<br/>Deduplicated delivery and retries"]
    API -.->|explicit adjustment / retry after commit| Queue
    Queue -->|OIDC POST /run| Claim

    subgraph Worker["Private planning worker · Cloud Run"]
        Claim["Claim delivery lease<br/>Load authoritative context"] --> Graph["Planning LangGraph"]
        Graph --> Publish["Publish atomically<br/>Check lease and revision"]
    end

    Claim <-->|job and athlete context| DB
    Publish -->|workouts, history and job completion| DB
    DB -->|calendar, job status and history| API
```

#### Chat LangGraph Workflow

```mermaid
flowchart TB
    Request["Chat request"] --> History["Load history node<br/>Supabase"]
    History --> Route["GPT-5 nano router"]

    subgraph Retrieval["Optional retrieval · parallel"]
        Context["User context node<br/>Supabase"]
        Search["Search node<br/>Chroma Cloud / Tavily"]
    end

    Route --> Retrieval
    Route -->|skip retrieval| Generate
    Retrieval --> Evaluate["GPT-5 nano evaluator<br/>Limited retries"]
    Retrieval -->|skip evaluation| Generate
    Evaluate -->|retry search only| Retrieval
    Evaluate -->|finish| Generate

    Generate["Streaming generation node"]
```

#### Workout Programming LangGraph Workflow

```mermaid
flowchart TB
    Request["Claimed job + athlete context<br/>Initial plan / weekly extension / adjustment"] --> Context["Context node<br/>Fixed dates, editable workouts and athlete inputs"]
    Context --> Prepare["Prepare node · OpenAI<br/>Focused research query"]
    Prepare --> Search["Search node<br/>Chroma first · Tavily available on retry"]
    Search --> Evaluate{"Evaluate node · OpenAI<br/>Sufficient evidence?"}
    Evaluate -->|yes| Generate["Generate node · OpenAI<br/>Structured PlanningProposal"]
    Evaluate -->|one research retry| Search
    Evaluate -->|insufficient after retry / budget exhausted| Fail["Raise error<br/>No publication"]
    Generate --> Validate{"Validate node<br/>Dates, coverage, prescriptions and protected workouts"}
    Validate -->|one repair with feedback| Generate
    Validate -->|invalid after repair / budget exhausted| Fail
    Validate -->|valid| Plan["Return validated proposal<br/>Worker publishes outside the graph"]
```

#### Database Infrastructure

```mermaid
erDiagram
    direction LR

    AUTH_USERS ||--|| PROFILES : owns
    PROFILES ||--o| ONBOARDING_RESPONSES : completes
    PROFILES ||--o| PLANNING_SCHEDULES : configures
    PROFILES ||--o{ PLANNING_CHANGES : records
    PLANNING_CHANGES ||--o{ WORKOUTS : creates
    WORKOUTS ||--o{ EXERCISES : contains
    EXERCISES ||--o{ EXERCISE_SETS : contains
    PLANNING_CHANGES ||--o{ PLANNING_CHANGE_WORKOUTS : records
    WORKOUTS ||--o{ PLANNING_CHANGE_WORKOUTS : participates
    PROFILES ||--o{ WORKOUTS : schedules
    PROFILES ||--o{ PLANNING_CHANGE_WORKOUTS : owns
    PROFILES ||--o{ REPLAN_JOBS : queues
    PLANNING_CHANGES o|--o{ REPLAN_JOBS : produces
    PROFILES ||--o{ SPORTS_WORKOUTS : schedules
    PROFILES ||--o{ CONVERSATIONS : owns
    CONVERSATIONS ||--o{ MESSAGES : contains
    PROFILES ||--o{ MESSAGES : owns

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

    PLANNING_SCHEDULES {
        uuid user_id PK,FK
        integer horizon_days
        integer refresh_interval_days
        date horizon_end
        timestamptz next_refresh_at
        bigint revision
        timestamptz created_at
        timestamptz updated_at
    }

    PLANNING_CHANGES {
        uuid id PK
        uuid user_id FK
        bigint revision
        text kind
        text status
        text reason
        date effective_from
        date effective_through
        date horizon_end_before
        date horizon_end_after
        timestamptz created_at
    }

    WORKOUTS {
        uuid id PK
        uuid user_id FK
        uuid created_by_change_id FK
        date scheduled_date
        text name
        text status
        text notes
        timestamptz started_at
        timestamptz completed_at
        timestamptz skipped_at
        timestamptz superseded_at
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

    PLANNING_CHANGE_WORKOUTS {
        uuid change_id PK,FK
        uuid workout_id PK,FK
        uuid user_id FK
        text side
    }

    REPLAN_JOBS {
        uuid id PK
        uuid user_id FK
        text kind
        text status
        text reason
        text deduplication_key
        date effective_from
        date effective_through
        timestamptz scheduled_for
        timestamptz available_at
        integer attempts
        bigint expected_revision
        uuid lease_token
        timestamptz lease_expires_at
        uuid change_id FK
        text error
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
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

    CONVERSATIONS {
        uuid id PK
        uuid user_id FK
        text title
        timestamptz created_at
    }

    MESSAGES {
        uuid id PK
        uuid user_id FK
        uuid conversation_id FK
        text role
        text content
        timestamptz created_at
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

build and install offline app using xcode from /mobile

>> npx expo run:ios --configuration Release --device

run web client from /client

>> npm run dev
