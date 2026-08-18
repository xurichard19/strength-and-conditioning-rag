# Supabase Data Layer

> **FRONTEND AUDIT REMINDER: REMOVE THE LEGACY SAVEDPLAN TYPES, CONVERSION ADAPTER, AND CALENDAR DATA FLOW AFTER SUPABASE AND THE PLAN ENDPOINTS USE THE TRACKED WORKOUT CONTRACT.**

`app.db.supabase` is the single place for reusable Supabase table queries. Routers
and AI workflows call these domain modules directly; workflows do not call FastAPI
routes.

```text
FastAPI router ─┐
                ├─> app.db.supabase.<domain> ─> transport.py ─> Supabase REST API
LangGraph node ─┘
```

## File Responsibilities

- `transport.py`: generic REST transport only. It owns HTTP request construction,
  caller JWT headers, timeouts, response decoding, and generic Supabase errors.
- `profiles.py`: profile reads, recovery for an unexpectedly missing profile, and
  allowed profile updates.
- `workouts.py`: planned and completed workout reads, date-range queries, and plan
  persistence.
- `conversations.py`: conversation history and message persistence.
- `__init__.py`: compatibility exports for the existing low-level imports. New
  domain code should import primitives directly from `transport.py`.

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
   them. Do not leak raw rows above the database layer once the contract is stable.
5. Add a unit test that mocks `app.db.supabase.transport` and asserts the user
   filter, date boundaries, ordering, and output mapping.

Example implementation shape:

```python
from app.db.supabase.transport import select_rows


def get_workouts_in_range(user_id, access_token, start_date, end_date):
    rows = select_rows(
        "exercises",
        [
            ("select", "workout_id,scheduled_date,order_index,name,sets,reps,notes"),
            ("scheduled_date", f"gte.{start_date.isoformat()}"),
            ("scheduled_date", f"lte.{end_date.isoformat()}"),
            ("order", "scheduled_date.asc,order_index.asc"),
        ],
        access_token,
    )
    return map_rows_to_workouts(rows)
```

Use the database schema you settle on for the final column list and mapper. The
current skeletons deliberately raise `NotImplementedError` so they cannot be wired
accidentally before that work is complete.

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
`workouts.get_recent_workouts`, then invoke the graph.

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
