# frontend api handoff

`schemas.py` owns HTTP request/response shapes, including nested workout data and streamed chat events. `contracts.py` owns business records and operation inputs/results. Routers translate between them and call Supabase handlers; AI workflows and services call those handlers directly without importing API schemas. Shared status literals remain in contracts.

Use `/docs` or `/openapi.json` for exact JSON fields. Requests reject unknown fields. Every route below requires `Authorization: Bearer <supabase access token>` except `/health` and `/`. Never send a user ID or service-role key. Successful authenticated responses disable caching.

## endpoints

| method | path | purpose |
| --- | --- | --- |
| GET | `/profile` | read identity and preferences; missing profile is 404 |
| PATCH | `/profile` | change display name or timezone; omitted fields are unchanged |
| GET | `/onboarding` | read flexible answers; null before the first save |
| PUT | `/onboarding` | replace the complete answers object without resetting completion |
| POST | `/onboarding/complete` | mark saved answers complete; repeated calls preserve the first timestamp |
| GET | `/calendar` | current generated workouts, non-cancelled sports, and planning revision |
| GET | `/workouts/{id}` | current workout, nested exercises/sets, and planning revision |
| PUT | `/workouts/{id}/results` | atomically save status and submitted set results |
| POST | `/sports-workouts` | create a sports commitment; returns 201 |
| GET | `/sports-workouts/{id}` | read a commitment, including cancelled sessions |
| PATCH | `/sports-workouts/{id}` | edit supplied commitment fields |
| PUT | `/sports-workouts/{id}/status` | mark planned, completed, or cancelled |
| DELETE | `/sports-workouts/{id}` | permanently delete and return the commitment |
| GET | `/planning/schedule` | read coverage/cadence/revision; null before setup |
| PUT | `/planning/schedule` | initialize or explicitly reconfigure refresh settings |
| POST | `/planning/adjustments` | queue a dated adjustment and return job status; returns 202 |
| GET | `/planning/jobs` | bounded oldest-first page of pending/running jobs |
| GET | `/planning/jobs/{id}` | poll any owned job, including terminal states |
| POST | `/planning/jobs/{id}/cancel` | cancel pending/running work, not published changes |
| POST | `/planning/jobs/{id}/retry` | explicitly retry failed/cancelled work; returns 202 |
| GET | `/planning/changes` | newest-first change history and current revision |
| GET | `/planning/changes/{id}` | original affected before/after workouts and current revision |
| POST | `/planning/changes/{id}/undo` | undo the latest applied change |
| POST | `/planning/changes/{id}/redo` | redo the earliest undone change |
| GET | `/chat/messages` | a chronological page of persisted user/assistant messages |
| POST | `/chat` | save a user turn and stream/persist the assistant reply |
| GET | `/health` | API liveness only; not dependency or worker readiness |

## calendar and result writes

`GET /calendar?start_date=2026-09-14&end_date=2026-09-20` uses inclusive local calendar dates, with at most 366 days between endpoints. Current means `superseded_at` is null, not just status planned: completed and skipped workouts remain visible. Sports start times are local wall-clock times without offsets.

Calendar, workout detail, and history reads check the planning revision before and after reading. A concurrent change returns 409 rather than labelling older data with a newer revision. This is optimistic checking, not a database snapshot. A null revision means no schedule exists; never substitute zero.

Result writes require `expected_revision` from the displayed data:

```json
{
  "expected_revision": 4,
  "status": "in_progress",
  "sets": [
    {"id": "22222222-2222-4222-8222-222222222222", "actual_reps": 5, "result_status": "completed"}
  ]
}
```

Each submitted set replaces its full result values: omitted actual values are cleared. Sets absent from the list remain unchanged. Reload after a conflict or uncertain write response; do not automatically retry with a newer revision. The returned revision is for subsequent guarded operations, not a replacement calendar payload.

## planning and history

An adjustment accepts `deduplication_key`, `reason`, `effective_from`, and `effective_through`. Dates are inclusive and must fall within existing coverage; adjustments never move the refresh cadence or extend the horizon. Reuse the same key only for the same logical request and payload. A retry may return an existing terminal job rather than enqueueing new work.

Schedule configuration defaults to a seven-day horizon and seven-day cadence. `next_refresh_at` must include a timezone offset. A due initial schedule is intended to be picked up by the scheduler; configuring it does not synchronously generate workouts. Do not reconfigure the schedule merely to request an adjustment.

Poll the returned job ID until terminal. On success, reload the calendar. Job responses omit lease tokens, worker errors, and internal retry metadata. A cancellation response can show an already-terminal state; inspect its status.

History pagination uses `limit` (1–100) and `before_revision` from the last change on the previous page. That original change revision is distinct from the top-level current revision used for mutations. Undo/redo accept `{"expected_revision": 4}`. They switch existing workout versions, do not copy trees, and reject stale, out-of-order, or performed targets. Repeated undos require selecting the next eligible change and the latest revision. New committed changes discard the redo branch. Sports deletions are not restored by planning undo.

## chat

`POST /chat` accepts `{"text": "..."}` and returns `application/x-ndjson`. Parse complete newline-separated objects, not individual network chunks. Event schemas are `ChatStreamEvent` in `schemas.py`:

```json
{"type":"text","delta":"hello"}
{"type":"sources","sources":[]}
{"type":"done","message_id":"22222222-2222-4222-8222-222222222222"}
```

After headers are sent, failures arrive as `{"type":"error","message":"chat response could not be completed"}`. Only `done` confirms assistant persistence. A failed/disconnected stream may leave the saved user turn without an assistant reply. There is no background completion guarantee, concurrent-turn serialization, or message request key: send one turn at a time and do not blindly replay POST requests. Sources are streamed but not stored in message history.

History accepts `limit` (1–100). For an older page, supply both `before_created_at` (offset-aware timestamp) and `before_id` from the first/oldest message of the previous page. Pages are returned oldest to newest.

## failures and remaining integration

401 means missing/expired authentication; 403 means denied access; 404 means missing or invisible data; 409 means a revision/state conflict; 422 means invalid input/operation; 502 means an upstream data failure. Raw database/provider errors are not returned. Writes are never automatically retried. Sports creation has no request key; reload commitments after an uncertain response before creating again.

The scheduler and replan worker are still skeletons. Queueing a job does not execute generation until those are implemented. Automatic trigger orchestration for sports edits, results, surveys, chat, and profile/onboarding changes is not wired: current writes invalidate planning inputs, and `/planning/adjustments` is the explicit request path. Onboarding completion alone does not configure or generate a plan. Background work also needs the outstanding scheduler timezone-validation and due-batch fairness fixes before production use.

The old `/plan` routes and fixed-question onboarding API are intentionally removed. Frontend callers must migrate to this surface. Endpoint tests mock external services; live Supabase/AI integration and frontend end-to-end tests remain necessary before release.
