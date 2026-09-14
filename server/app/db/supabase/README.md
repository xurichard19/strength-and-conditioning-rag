# Supabase Data Layer

`app.db.supabase` is the single place for reusable Supabase table queries. Routers
and AI workflows call these domain modules directly; workflows do not call FastAPI
routes.

```text
FastAPI router ─┐
                ├─> app.db.supabase.<domain> ─> transport.py ─> Supabase REST API
LangGraph node ─┘
```

## File Responsibilities

- `transport.py`: generic REST and RPC transport only. It owns HTTP request
  construction, caller JWT headers, timeouts, response decoding, and generic
  Supabase errors. It does not know domain RPC names or payload shapes.
- `profiles.py`: profile reads, recovery for an unexpectedly missing profile, and
  allowed profile updates.
- `onboarding_responses.py`: onboarding-answer reads and writes.
- `planning_changes.py`: change history reads and atomic rollback.
- `workouts.py`: current calendar, history, replanning reads, and atomic replacement.
- `sports_workouts.py`: user-entered sports constraints and their lifecycle.
- `messages.py`: user message history and persistence.
- `__init__.py`: public convenience exports for transport primitives and the atomic workout RPC.

The domain files own table names, selected columns, query filters, ordering, and
mapping Supabase rows into application contracts. Keep raw query tuples out of
routers and workflow nodes.

## Implementing A Query

1. Add a focused function to the matching domain file. Use application-oriented
   names such as `get_recent_workouts`, not generic names such as `select_exercises`.
2. Accept `user_id` and the verified caller `access_token`. The user ID scopes the
   query explicitly; the JWT lets Supabase enforce RLS.
3. Build Supabase filters inside the domain function and call the primitives in
   `transport.py`.
4. Convert returned rows into the appropriate application contract before returning
   them. Workout reads return `WorkoutRecord`; do not leak raw rows above the
   database layer once the contract is stable.
5. Add a unit test that mocks `app.db.supabase.transport` and asserts the user
   filter, date boundaries, ordering, and output mapping.

`workouts.get_workouts_in_range` is the reference implementation for nested table
selection, deterministic ordering, ownership scoping, and contract mapping.

## Atomic Mutations And RPC

The RPC migration now implements job-based publication and version-switching
undo/redo. See [Planning RPCs](../../../../supabase/RPCS.md) for signatures, return
values, permissions, and worker behavior.

The existing Python mutation wrappers still target the previous RPC signatures and
must be updated before use. New planning RPCs require the backend service role;
ordinary owner-scoped reads continue to use the caller JWT. No worker or scheduler
is wired yet.

## Wiring Existing Routers

### Profile router

Move `_profile_query`, `_load_profile`, and `_update_profile_rows` from
`app.api.routers.profile` into `app.db.supabase.profiles`. The router should keep
only request validation, HTTP error translation, response headers, and
onboarding-specific HTTP behavior.

### Plan router

After the workout schema migration, move saved-plan listing and persistence from
`app.api.routers.plan` into `app.db.supabase.workouts`. The `/plan/generate` route
should obtain profile and recent-workout context through `profiles.get_profile` and
`workouts.get_recent_workouts`, then invoke the graph. Accepted proposals should be
persisted through the transaction RPC rather than row-by-row inserts.

### Workouts router

When it is ready, the date-range endpoint should call
`workouts.get_workouts_in_range`. Do not reimplement filters, ordering, or row
mapping in the route.

## Wiring AI Workflows

LangGraph nodes use the same domain functions as routers. They obtain the verified
identity values from `runtime.context` and never call an internal HTTP endpoint.

```python
import asyncio
from datetime import date

from langgraph.runtime import Runtime

from app.ai.workflows.plan.state import WorkflowContext
from app.db.supabase.workouts import get_recent_workouts


async def load_training_history_node(state, runtime: Runtime[WorkflowContext]):
    workouts = await asyncio.to_thread(
        get_recent_workouts,
        runtime.context.user_id,
        runtime.context.access_token,
        date.today(),
    )
    return {"recent_workouts": workouts}
```

Keep blocking database helpers in a worker thread until `transport.py` is migrated
to an async HTTP client. When that happens, make the domain functions async and
replace `asyncio.to_thread(...)` with direct `await` calls.

## Ownership Rules

- Auth verifies a token and returns `AuthUser`; it does not own profile or workout
  queries.
- Routers do HTTP work; they do not own Supabase query syntax.
- Workflows decide when user data is needed; they do not call FastAPI routes.
- `app.db.supabase` owns Supabase table interactions and application-row mapping.
- Application services own replanning policy, confirmation, and orchestration across
  workflows and database transactions.
