# Supabase handlers

Routers and workflows call domain handlers, never build Supabase filters or write
nested workout rows themselves. Business policy stays outside this layer.

## Modules

- `profiles`: profile reads and allowed updates; account creation uses the auth trigger.
- `onboarding_responses`: read and replace flexible onboarding answers.
- `messages`: save messages and read chronological pages using a stable cursor.
- `workouts`: current calendar/planning reads, historical versions, and atomic results.
- `sports_workouts`: user-entered training, partial edits, status changes, and deletion.
- `planning_schedules`: coverage, cadence configuration, and input revisions.
- `planning_changes`: history, before/after references, and atomic undo/redo.
- `replan_jobs`: queue, claim, renew, complete, fail, cancel, retry, and retention.
- `calendar`: combined workout/sports reads and revision-checked worker context.
- `_queries`: internal validation, pagination, and single-row RPC decoding.
- `transport`: HTTP, credentials, structured errors, and raw table/RPC requests.
- `__init__`: exports domain modules and `SupabaseDataError`, not raw transport calls.

Every public handler returns typed records, a typed receipt, a scalar, or `None`.
Date ranges are inclusive. Calendar reads exclude superseded workouts and cancelled
sports sessions. Use `planned_only=True` for replacement candidates and explicit
historical reads for previous versions. Range reads paginate; message/change history
uses bounded cursor pages. Partial updates preserve omitted fields and send explicit
nulls to clear nullable fields. Set result inputs replace the supplied sets' full
result values; omitted sets remain untouched.

## Credentials and execution

Pass the verified caller JWT to ordinary reads/writes so RLS applies, and derive
`user_id` from authentication, not an untrusted request body. Backend worker reads
accept `access_token=None`. RPC wrappers use backend credentials internally because
the migration restricts them to the service role. Configure
`SUPABASE_SERVICE_ROLE_KEY` with the service-role JWT; never ship it to the client.
Backend wrappers bypass RLS, so their caller must authorize the requested user.

Handlers are synchronous. Call them in synchronous routes or with
`await asyncio.to_thread(...)` from async routes/workflows. Transport does not retry
writes. Reuse request keys only for retries of the same operation.

```python
from app.db.supabase import calendar, replan_jobs

events = calendar.get_calendar(user.id, start_date, end_date, access_token)
job = replan_jobs.enqueue_adjustment(user.id, request_key, reason, start_date, end_date)
```

## Planning flow

The application decides whether a survey, injury, chat request, or sports edit
warrants replanning and chooses the adjustment dates. These handlers persist that
decision; saving sports/profile/onboarding data does not itself enqueue a job.
Database triggers invalidate stale planning inputs automatically.

A scheduler calls `enqueue_due_replans`. A worker claims a job, loads
`calendar.get_replan_context`, runs the planner, renews its lease as needed, and
calls `complete_replan_job` with only changed workout IDs and replacements.
The claim's effective dates bound edits; its horizon end bounds context. A revision
conflict requires fresh context and regeneration, not retrying an old proposal.
The database checks the revision and lease again at publication. A successful
no-change result can have `change_id=None`.

Undo/redo uses an existing change ID plus the revision displayed to the user.
The database switches the existing workout versions atomically and rejects stale
or out-of-order requests. See [Planning RPCs](../../../../supabase/RPCS.md).

These handlers do not start a scheduler or worker. Existing routes and workflow
call sites still need migration to this interface.
