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

## Handoff: failures and caller responsibilities

The function docstrings are the operation-level reference: they describe input
semantics, side effects, return ordering, and retry behavior. The rules below
apply across modules.

- Authenticate first. Derive user IDs from the verified session or trusted job,
  not a client-supplied owner field. Backend credentials bypass RLS; explicit
  owner filters do not replace authorization.
- Construct the typed write inputs before calling handlers. Planning output
  contracts reject unknown fields, including old names such as `reps` in place
  of `planned_reps`. Do not catch validation errors and substitute empty plans.
- Use the athlete's timezone to choose calendar dates. Range handlers compare
  dates as supplied; they do not convert UTC timestamps into local dates.
- `ValueError` indicates local validation such as an invalid UUID, empty patch,
  or reversed date range. Pydantic `ValidationError` can indicate invalid write
  input or an unexpected database response; distinguish those at the call site.
- `SupabaseDataError` carries `status_code` and `code` when available. RPC 400
  errors describe invalid arguments; 404 means required state is missing; 409
  means a revision, lease, request key, or history-order conflict. Read the
  operation-specific error and reload state rather than treating every 409 as
  a temporary network failure.
- A network timeout can occur after a successful commit. Publication is
  deduplicated by retained job ID and adjustment enqueue by retained request key.
  Message/sports inserts have no such key. Undo/redo and result writes use
  expected revisions: inspect current state before retrying an uncertain write.
- `None` from a single-record reader means no visible match, not necessarily
  that the ID does not exist. An empty list is a successful empty read. In
  contrast, `None` from job claiming means no claim was issued on that pass;
  it can also follow retirement of an expired/exhausted job.
- Each handler is synchronous. `asyncio.to_thread` avoids blocking an async
  event loop, but cancelling that await does not guarantee the database write
  stopped. There is no transaction spanning multiple handler calls.

### Worker integration checklist

1. Configure a schedule explicitly during setup/settings changes. Do not reset
   `next_refresh_at` when an adjustment is requested.
2. Persist an input change, then decide whether to enqueue an adjustment and
   choose its inclusive window. Those are separate transactions: the future
   application layer must address a crash between saving and enqueuing. No
   outbox or atomic input-plus-enqueue handler is implemented here.
3. Run scheduler passes with `enqueue_due_replans`; workers claim independently.
   Monitor terminal failures and overdue schedules. Automatic attempts stop
   after five; recovery requires an explicit retry or a later occurrence.
4. Load context from the claim. Use the claim's effective dates for edits, even
   though its calendar context extends to the horizon. Renew the lease during
   long model calls; this handler layer does not start a heartbeat for you.
5. Compare the proposal with current versions. Submit only changed/removed IDs
   and new versions; the database does not detect semantically identical plans.
   It guards data integrity, not training quality or completeness.
6. If inputs changed, discard the proposal. Release the still-valid claim for
   retry, then reclaim and regenerate with fresh context. If the lease was lost,
   stop trying to publish or mutate that claim. After an uncertain publication,
   inspect the job or repeat publication for the same retained job ID.
7. Refresh the calendar and revision after successful publication, results, or
   undo/redo. Do not infer current calendar state solely from receipt IDs: later
   changes may already have superseded those versions.
