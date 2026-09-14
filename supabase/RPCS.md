# Planning RPCs

Defined in `migrations/20260903000000_workout_rpcs.sql`. These replace the former
replacement/copying-rollback functions. Typed Python wrappers live in `server/app/db/supabase`.

All RPCs are backend-only (`service_role`). Authenticate and authorize the caller
before passing a user ID. Never send the service-role credential to a client.
Clients retain owner-scoped calendar/history reads. Direct client writes to workouts,
exercises, sets, and planning changes are disabled to protect immutable versions.

## Schedule and queue

| Function | Arguments | Result and behavior |
|---|---|---|
| `configure_planning_schedule` | user ID, next refresh timestamp, horizon days=7, interval days=7 | Schedule row. Initializes coverage metadata or explicitly changes cadence. A real configuration change increments revision and cancels outstanding refresh jobs; identical settings are a no-op. Does not generate workouts. |
| `enqueue_adjustment` | user ID, deduplication key, reason, inclusive start/end | Job row. Validates coverage, queues the exact window, and increments revision. Reusing a key returns its job; mismatched parameters conflict. |
| `enqueue_due_replans` | limit=100 | Number queued. Finds due schedules, skips users with outstanding refreshes, consolidates missed occurrences into the latest due boundary, and deduplicates by user/occurrence. Preserves local wall-clock cadence across DST. |
| `claim_replan_job` | lease seconds=300 | JSON containing `job`, `effective_from`, `effective_through`, `horizon_end`, or null. Claims one job with a fresh token and current revision. Serializes by user, skips locked schedules, and reclaims expired leases. After five attempts, fails abandoned work. Null can also mean it retired an exhausted/expired job; poll again later. |
| `renew_replan_lease` | job ID, token, lease seconds=300 | New expiry. Only an unexpired current token may renew. |
| `fail_replan_job` | job ID, token, error, retry=true | Job row. Requeues with exponential backoff or marks terminal failure. Clears the lease. Maximum five attempts before explicit retry is needed. Store sanitized errors, not credentials or raw model inputs. |
| `cancel_replan_job` | user ID, job ID | Job row. Cancels pending/running work and fences its worker. Terminal jobs are returned unchanged. |
| `retry_replan_job` | user ID, job ID | Job row. Explicitly resets failed/cancelled work to pending. Rejects obsolete refresh occurrences. Existing live/successful jobs are returned unchanged. |
| `purge_replan_jobs` | cutoff timestamp, limit=1000 | Number deleted. Bounded terminal-job cleanup; requires at least seven days of retention. Never deletes change/workout history. Deduplication is bounded by retention. |

Distinct adjustment requests remain separate jobs. This avoids losing retry keys or
widening disjoint windows. Only one job per user runs at once. Coalescing is not yet
implemented. The scheduler and worker processes that call these RPCs are also not
implemented here.

## Publication and history

`complete_replan_job(job_id, lease_token, before_ids, workouts)` publishes a proposal.
`before_ids` is a UUID array of only the current workout versions to replace/remove;
`workouts` is an array in the `PlannedWorkout` JSON shape containing only new versions.
Omit unchanged workouts from both arrays. Empty arrays are supported, including a
no-change adjustment or a rest-only coverage extension. The caller is responsible
for the quality and completeness of the generated schedule.

The transaction locks the user's schedule, verifies lease and revision, enforces
the job's permitted dates, and rejects performed workouts. It saves new content and
before/after links, deactivates old versions, advances revision, and completes the
job together. A scheduled refresh also advances coverage and its anchored next due
date; an adjustment does neither. Invalid nested content rolls back everything.

Returns `{change_id, workout_ids, revision}`. `change_id` is null for a true no-op;
otherwise it equals the job ID. Successful retries return the original receipt's
change/workout IDs with the current schedule revision. Reusing a completed job ID
never publishes a second proposal. Keep job records for the retry retention period.

`undo_planning_change(user_id, change_id, expected_revision)` and
`redo_planning_change(user_id, change_id, expected_revision)` return the same receipt
shape. Undo requires the latest applied change; redo requires the earliest undone
change. They toggle `superseded_at` on linked rows without copying content, restore
the appropriate coverage boundary, and increment revision without moving cadence.
Both sides must be free of results. A new committed change discards the redo branch.
Explicit targets and expected revisions prevent a repeated click from undoing an
additional change. A retry after success reports a revision conflict: refresh the
calendar/history before deciding whether another operation is needed.

## Input and result changes

`invalidate_planning_inputs(user_id)` increments and returns the revision for
inputs without a dedicated table. Profile, onboarding, and sports-workout writes
automatically bump it through database triggers. These triggers invalidate proposals;
they do not decide whether to enqueue an adjustment. Save a durable input before
enqueuing its request. Trigger/job orchestration belongs to the future backend layer.

`record_workout_results(user_id, workout_id, expected_revision, status, sets=[])`
updates a current workout and returns the new revision. Each submitted set object
contains its `id` plus the complete actual-result fields; omitted actual fields are
cleared. Unlisted sets are unchanged. It validates set ownership, stores results and
status timestamps atomically, and invalidates in-flight proposals. A stale revision
requires reloading before retrying. Planned content is never edited here.

`set_planning_change_applied`, `workout_has_results`, and
`bump_planning_input_revision` are implementation helpers, not application entry points.

## Verification

Use a disposable PostgreSQL 17 instance. `tests/bootstrap.sql` supplies minimal
Supabase auth/role fixtures; **never run it against a Supabase project**. Apply the
initial migration and RPC migration, then run `tests/planning_rpcs.sql` with
`psql -v ON_ERROR_STOP=1`. The SQL tests roll back their fixtures.

`python supabase/tests/concurrency.py <disposable-container-name>` tests two workers
claiming different users and simultaneous duplicate publication through Docker.
It creates and removes its own users. The standalone fixtures exercise PostgreSQL
transactions and privileges, not the PostgREST HTTP layer.
