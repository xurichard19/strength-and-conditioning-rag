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
- `workouts.py`: planned and completed workout reads, date-range queries, and plan
  persistence.
- `conversations.py`: conversation history and message persistence.
- `__init__.py`: blank package marker. Domain modules import primitives directly
  from `transport.py`.

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

Example implementation shape:

```python
from app.contracts import WorkoutRecord
from app.db.supabase.transport import select_rows


def get_workouts_in_range(
    user_id,
    access_token,
    start_date,
    end_date,
) -> list[WorkoutRecord]:
    rows = select_rows(
        "workouts",
        [
            (
                "select",
                "id,version,name,scheduled_date,completed_at,superseded_at,notes,"
                "exercises(id,order_index,name,reps_per_side,weight_unit,distance_unit,notes,"
                "exercise_sets(id,order_index,planned_reps,planned_weight,planned_distance,"
                "planned_duration_minutes,planned_rpe,planned_rest_seconds,planned_notes,"
                "actual_reps,actual_weight,actual_distance,actual_duration_minutes,actual_rpe,"
                "completed_at,missed_at,result_notes))",
            ),
            ("user_id", f"eq.{user_id}"),
            ("scheduled_date", f"gte.{start_date.isoformat()}"),
            ("scheduled_date", f"lte.{end_date.isoformat()}"),
            ("superseded_at", "is.null"),
            ("order", "scheduled_date.asc,id.asc"),
        ],
        access_token,
    )
    return map_rows_to_workout_records(rows)
```

Use the database schema you settle on for the final column list and mapper. The
current skeletons deliberately raise `NotImplementedError` so they cannot be wired
accidentally before that work is complete.

## Atomic Mutations And RPC

Multi-table workout changes must use one Supabase RPC rather than a sequence of REST
inserts. The database function should verify ownership and expected versions,
deduplicate the idempotency key, supersede affected workouts, insert replacement
workouts/exercises/sets, record the planning change, and commit atomically.

The generic `call_rpc(function_name, payload, access_token)` HTTP helper belongs in
`transport.py`. The domain module owns the concrete function name, typed input
mapping, and conversion of the RPC response into application contracts. For example,
`workouts.py` may call an `apply_planning_change` RPC, but routers and graph nodes
must not call that transport helper directly.

Do not keep a database transaction open while a LangGraph or model call runs. The
graph creates a proposal first; the authenticated application service submits the
accepted proposal to the RPC afterward.

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
