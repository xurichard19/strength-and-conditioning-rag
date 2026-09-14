-- Backend-only RPCs. The backend authenticates the user before passing user_id.
-- All calendar writers lock planning_schedules before touching jobs or workouts.
-- Separate pending requests preserve exact windows and durable retry keys.
drop index if exists public.replan_jobs_one_pending_adjustment_idx;

create or replace function public.configure_planning_schedule(
  p_user_id uuid, p_next_refresh_at timestamptz,
  p_horizon_days integer default 7, p_refresh_interval_days integer default 7
) returns public.planning_schedules
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules;
begin
  insert into public.planning_schedules(user_id, next_refresh_at, horizon_days, refresh_interval_days)
  values (p_user_id, p_next_refresh_at, p_horizon_days, p_refresh_interval_days)
  on conflict (user_id) do update set
    next_refresh_at = excluded.next_refresh_at,
    horizon_days = excluded.horizon_days,
    refresh_interval_days = excluded.refresh_interval_days,
    revision = planning_schedules.revision + 1
  where (planning_schedules.next_refresh_at, planning_schedules.horizon_days, planning_schedules.refresh_interval_days)
    is distinct from (excluded.next_refresh_at, excluded.horizon_days, excluded.refresh_interval_days)
  returning * into v_schedule;
  if not found then
    select * into v_schedule from public.planning_schedules where user_id = p_user_id;
    return v_schedule;
  end if;
  -- A changed cadence invalidates pending/running refresh occurrences.
  update public.replan_jobs set status = 'cancelled', completed_at = clock_timestamp(),
    lease_token = null, lease_expires_at = null
  where user_id = p_user_id and kind = 'refresh' and status in ('pending', 'running');
  return v_schedule;
end;
$$;

create or replace function public.enqueue_adjustment(
  p_user_id uuid, p_deduplication_key text, p_reason text,
  p_effective_from date, p_effective_through date
) returns public.replan_jobs
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_job public.replan_jobs;
begin
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found then raise sqlstate 'PT404' using message = 'planning schedule not found'; end if;
  select * into v_job from public.replan_jobs
  where user_id = p_user_id and deduplication_key = p_deduplication_key;
  if found then
    if v_job.kind <> 'adjustment' or v_job.reason is distinct from p_reason
      or v_job.effective_from is distinct from p_effective_from
      or v_job.effective_through is distinct from p_effective_through then
      raise sqlstate 'PT409' using message = 'deduplication key already used';
    end if;
    return v_job;
  end if;
  if v_schedule.horizon_end is null or p_effective_from is null or p_effective_through is null
    or p_effective_from > p_effective_through or p_effective_through > v_schedule.horizon_end then
    raise sqlstate 'PT400' using message = 'adjustment window must be within coverage';
  end if;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, effective_from, effective_through)
  values(p_user_id, 'adjustment', p_reason, p_deduplication_key, p_effective_from, p_effective_through)
  returning * into v_job;
  -- A new planning request also invalidates proposals already in flight.
  update public.planning_schedules set revision = revision + 1 where user_id = p_user_id;
  return v_job;
end;
$$;

create or replace function public.enqueue_due_replans(p_limit integer default 100)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule record; v_due timestamp; v_now timestamp; v_count integer := 0; v_rows integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 1000';
  end if;
  for v_schedule in
    select s.*, p.timezone from public.planning_schedules s join public.profiles p on p.id = s.user_id
    where s.next_refresh_at <= clock_timestamp()
      and not exists (select 1 from public.replan_jobs j where j.user_id = s.user_id
        and j.kind = 'refresh' and j.status in ('pending', 'running'))
    order by s.next_refresh_at limit p_limit for update of s skip locked
  loop
    v_due := v_schedule.next_refresh_at at time zone v_schedule.timezone;
    v_now := clock_timestamp() at time zone v_schedule.timezone;
    -- Jump to the latest due boundary without moving its local time or cadence.
    v_due := v_due + make_interval(days => greatest(0,
      ((v_now::date - v_due::date) / v_schedule.refresh_interval_days)
      * v_schedule.refresh_interval_days));
    if v_due > v_now then v_due := v_due - make_interval(days => v_schedule.refresh_interval_days); end if;
    insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for)
    values(v_schedule.user_id, 'refresh', 'scheduled refresh',
      'refresh:' || extract(epoch from (v_due at time zone v_schedule.timezone))::text,
      v_due at time zone v_schedule.timezone)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

create or replace function public.claim_replan_job(p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_user_id uuid; v_job public.replan_jobs; v_schedule public.planning_schedules;
  v_today date; v_timezone text; v_from date; v_through date; v_horizon date;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise sqlstate 'PT400' using message = 'lease must be between 30 and 3600 seconds';
  end if;
  select s.user_id into v_user_id from public.planning_schedules s
  where not exists (select 1 from public.replan_jobs j where j.user_id = s.user_id
    and j.status = 'running' and j.lease_expires_at > clock_timestamp())
    and exists (select 1 from public.replan_jobs j where j.user_id = s.user_id
      and ((j.status = 'pending' and j.available_at <= clock_timestamp())
        or (j.status = 'running' and j.lease_expires_at <= clock_timestamp())))
  order by (select min(j.available_at) from public.replan_jobs j where j.user_id = s.user_id
    and j.status in ('pending', 'running')), s.user_id
  limit 1 for update of s skip locked;
  if not found then return null; end if;
  select * into v_schedule from public.planning_schedules where user_id = v_user_id;
  select * into v_job from public.replan_jobs where user_id = v_user_id
    and ((status = 'pending' and available_at <= clock_timestamp())
      or (status = 'running' and lease_expires_at <= clock_timestamp()))
  order by (status = 'running') desc, available_at, id limit 1 for update;
  if v_job.attempts >= 5 then
    update public.replan_jobs set status = 'failed', error = 'attempt limit reached',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = v_job.id;
    return null;
  end if;
  select timezone into v_timezone from public.profiles where id = v_user_id;
  v_today := (clock_timestamp() at time zone v_timezone)::date;
  if v_job.kind = 'adjustment' then
    v_from := greatest(v_today, v_job.effective_from);
    v_through := least(v_job.effective_through, v_schedule.horizon_end);
    v_horizon := v_schedule.horizon_end;
  else
    v_from := v_today;
    v_horizon := greatest(v_schedule.horizon_end,
      (v_job.scheduled_for at time zone v_timezone)::date + v_schedule.horizon_days - 1);
    v_through := v_horizon;
  end if;
  if v_horizon is null or v_from > v_through then
    update public.replan_jobs set status = 'cancelled', error = 'planning window expired',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = v_job.id;
    return null;
  end if;
  update public.replan_jobs set status = 'running', attempts = attempts + 1,
    expected_revision = v_schedule.revision, lease_token = gen_random_uuid(),
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), error = null
  where id = v_job.id returning * into v_job;
  return jsonb_build_object('job', to_jsonb(v_job), 'effective_from', v_from,
    'effective_through', v_through, 'horizon_end', v_horizon);
end;
$$;

create or replace function public.renew_replan_lease(
  p_job_id uuid, p_lease_token uuid, p_lease_seconds integer default 300
) returns timestamptz language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_expiry timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise sqlstate 'PT400' using message = 'lease must be between 30 and 3600 seconds';
  end if;
  update public.replan_jobs set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  where id = p_job_id and status = 'running' and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp() returning lease_expires_at into v_expiry;
  if not found then raise sqlstate 'PT409' using message = 'job lease expired or replaced'; end if;
  return v_expiry;
end;
$$;

create or replace function public.fail_replan_job(
  p_job_id uuid, p_lease_token uuid, p_error text, p_retry boolean default true
) returns public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs;
begin
  update public.replan_jobs set
    status = case when p_retry and attempts < 5 then 'pending' else 'failed' end,
    completed_at = case when p_retry and attempts < 5 then null else clock_timestamp() end,
    available_at = clock_timestamp() + make_interval(secs => least(900, 5 * power(2, attempts)::integer)),
    error = lower(left(p_error, 2000)), lease_token = null, lease_expires_at = null
  where id = p_job_id and status = 'running' and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp() returning * into v_job;
  if not found then raise sqlstate 'PT409' using message = 'job lease expired or replaced'; end if;
  return v_job;
end;
$$;

create or replace function public.cancel_replan_job(p_user_id uuid, p_job_id uuid)
returns public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs;
begin
  perform 1 from public.planning_schedules where user_id = p_user_id for update;
  update public.replan_jobs set status = 'cancelled', completed_at = clock_timestamp(),
    lease_token = null, lease_expires_at = null
  where id = p_job_id and user_id = p_user_id and status in ('pending', 'running') returning * into v_job;
  if not found then
    select * into v_job from public.replan_jobs where id = p_job_id and user_id = p_user_id;
    if not found then raise sqlstate 'PT404' using message = 'job not found'; end if;
  end if;
  return v_job;
end;
$$;

-- Explicit operator/user retry after terminal failure; preserve the occurrence key.
create or replace function public.retry_replan_job(p_user_id uuid, p_job_id uuid)
returns public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs;
begin
  perform 1 from public.planning_schedules where user_id = p_user_id for update;
  if exists(select 1 from public.replan_jobs j join public.planning_schedules s on s.user_id = j.user_id
    where j.id = p_job_id and j.user_id = p_user_id and j.kind = 'refresh'
      and j.status in ('failed', 'cancelled') and j.scheduled_for < s.next_refresh_at) then
    raise sqlstate 'PT409' using message = 'refresh occurrence is obsolete';
  end if;
  update public.replan_jobs set status = 'pending', attempts = 0, completed_at = null,
    available_at = clock_timestamp(), error = null, expected_revision = null
  where id = p_job_id and user_id = p_user_id and status in ('failed', 'cancelled')
  returning * into v_job;
  if not found then
    select * into v_job from public.replan_jobs where id = p_job_id and user_id = p_user_id;
    if not found then raise sqlstate 'PT404' using message = 'job not found'; end if;
  end if;
  return v_job;
end;
$$;

-- Deduplication keys remain valid for the retention period; never purge live jobs.
create or replace function public.purge_replan_jobs(p_before timestamptz, p_limit integer default 1000)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  if p_before is null or p_before > clock_timestamp() - interval '7 days'
    or p_limit is null or p_limit not between 1 and 10000 then
    raise sqlstate 'PT400' using message = 'retain at least seven days and use a limit between 1 and 10000';
  end if;
  with expired as (
    select id from public.replan_jobs where completed_at < p_before
    order by completed_at, id limit p_limit for update skip locked
  ) delete from public.replan_jobs j using expired e where j.id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Used for inputs without their own table (for example chat-derived constraints).
create or replace function public.invalidate_planning_inputs(p_user_id uuid)
returns bigint language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_revision bigint;
begin
  update public.planning_schedules set revision = revision + 1 where user_id = p_user_id
  returning revision into v_revision;
  if not found then raise sqlstate 'PT404' using message = 'planning schedule not found'; end if;
  return v_revision;
end;
$$;

-- Internal predicate: undo/replan must never deactivate performed training.
create or replace function public.workout_has_results(p_workout_id uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog, public as $$
  select exists(select 1 from public.workouts w where w.id = p_workout_id
    and (w.status <> 'planned' or w.started_at is not null or w.completed_at is not null
      or w.skipped_at is not null))
  or exists(select 1 from public.exercise_sets s join public.exercises e on e.id = s.exercise_id
    where e.workout_id = p_workout_id and (s.result_status <> 'pending' or s.completed_at is not null
      or s.actual_reps is not null or s.actual_weight is not null or s.actual_distance is not null
      or s.actual_duration_seconds is not null or s.actual_rpe is not null or s.result_notes is not null));
$$;

-- Input writes acquire the schedule lock and invalidate in-flight proposals.
create or replace function public.bump_planning_input_revision()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user_id uuid;
begin
  if tg_table_name = 'profiles' then
    v_user_id := new.id;
  elsif tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;
  update public.planning_schedules set revision = revision + 1 where user_id = v_user_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger profiles_planning_revision before update on public.profiles
for each row execute function public.bump_planning_input_revision();
create trigger onboarding_planning_revision before insert or update or delete on public.onboarding_responses
for each row execute function public.bump_planning_input_revision();
create trigger sports_planning_revision before insert or update or delete on public.sports_workouts
for each row execute function public.bump_planning_input_revision();

-- Planned content stays immutable; progress/results are the supported mutable fields.
create or replace function public.record_workout_results(
  p_user_id uuid, p_workout_id uuid, p_expected_revision bigint,
  p_status text, p_sets jsonb default '[]'::jsonb
) returns bigint language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_revision bigint; v_set jsonb; v_set_id uuid;
begin
  select revision into v_revision from public.planning_schedules where user_id = p_user_id for update;
  if not found then raise sqlstate 'PT404' using message = 'planning schedule not found'; end if;
  if v_revision is distinct from p_expected_revision then
    raise sqlstate 'PT409' using message = 'schedule revision changed';
  end if;
  if p_status is null or p_status not in ('planned', 'in_progress', 'completed', 'skipped')
    or jsonb_typeof(p_sets) is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'invalid workout status or sets';
  end if;
  perform 1 from public.workouts where id = p_workout_id and user_id = p_user_id and superseded_at is null;
  if not found then raise sqlstate 'PT404' using message = 'current workout not found'; end if;
  for v_set in select value from jsonb_array_elements(p_sets) loop
    v_set_id := (v_set->>'id')::uuid;
    update public.exercise_sets s set
      actual_reps = (v_set->>'actual_reps')::integer,
      actual_weight = (v_set->>'actual_weight')::numeric,
      actual_distance = (v_set->>'actual_distance')::numeric,
      actual_duration_seconds = (v_set->>'actual_duration_seconds')::integer,
      actual_rpe = (v_set->>'actual_rpe')::numeric,
      result_notes = v_set->>'result_notes',
      result_status = coalesce(v_set->>'result_status', 'pending'),
      completed_at = case when v_set->>'result_status' = 'completed' then clock_timestamp() else null end
    from public.exercises e where s.id = v_set_id and e.id = s.exercise_id and e.workout_id = p_workout_id;
    if not found then raise sqlstate 'PT400' using message = 'set does not belong to workout'; end if;
  end loop;
  update public.workouts set status = p_status,
    started_at = case when p_status in ('in_progress', 'completed') then coalesce(started_at, clock_timestamp()) else started_at end,
    completed_at = case when p_status = 'completed' then clock_timestamp() else null end,
    skipped_at = case when p_status = 'skipped' then clock_timestamp() else null end
  where id = p_workout_id;
  update public.planning_schedules set revision = revision + 1 where user_id = p_user_id returning revision into v_revision;
  return v_revision;
end;
$$;


-- p_before_ids contains only workouts being removed/replaced, not unchanged rows.
-- p_workouts contains only new versions, in the PlannedWorkout JSON shape.
-- The job id also identifies its committed change, making publication idempotent.
create or replace function public.complete_replan_job(
  p_job_id uuid, p_lease_token uuid, p_before_ids uuid[], p_workouts jsonb
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs; v_schedule public.planning_schedules; v_user_id uuid;
  v_timezone text; v_from date; v_through date; v_horizon date; v_next timestamptz;
  v_workout jsonb; v_exercise jsonb; v_set jsonb; v_wid uuid; v_eid uuid;
  v_eorder integer; v_sorder integer; v_ids jsonb; v_changed boolean;
begin
  select user_id into v_user_id from public.replan_jobs where id = p_job_id;
  if not found then raise sqlstate 'PT404' using message = 'job not found'; end if;
  select * into v_schedule from public.planning_schedules where user_id = v_user_id for update;
  select * into v_job from public.replan_jobs where id = p_job_id for update;
  if v_job.status = 'succeeded' then
    select coalesce(jsonb_agg(workout_id order by workout_id), '[]') into v_ids
    from public.planning_change_workouts where change_id = v_job.change_id and side = 'after';
    return jsonb_build_object('change_id', v_job.change_id, 'workout_ids', v_ids,
      'revision', v_schedule.revision);
  end if;
  if v_job.status <> 'running' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= clock_timestamp() then
    raise sqlstate 'PT409' using message = 'job lease expired or replaced';
  end if;
  if v_job.expected_revision <> v_schedule.revision then
    raise sqlstate 'PT409' using message = 'planning inputs changed; regenerate the proposal';
  end if;
  if p_before_ids is null or p_workouts is null or jsonb_typeof(p_workouts) <> 'array' then
    raise sqlstate 'PT400' using message = 'before ids and workouts must be arrays';
  end if;
  if exists(select 1 from unnest(p_before_ids) id where id is null)
    or cardinality(p_before_ids) <> (select count(distinct id) from unnest(p_before_ids) id) then
    raise sqlstate 'PT400' using message = 'before ids must be distinct and nonnull';
  end if;
  select timezone into v_timezone from public.profiles where id = v_user_id;
  v_from := (clock_timestamp() at time zone v_timezone)::date;
  v_next := v_schedule.next_refresh_at;
  if v_job.kind = 'adjustment' then
    v_from := greatest(v_from, v_job.effective_from);
    v_horizon := v_schedule.horizon_end;
    v_through := least(v_job.effective_through, v_horizon);
  else
    v_horizon := greatest(v_schedule.horizon_end,
      (v_job.scheduled_for at time zone v_timezone)::date + v_schedule.horizon_days - 1);
    v_through := v_horizon;
    v_next := ((v_job.scheduled_for at time zone v_timezone)
      + make_interval(days => v_schedule.refresh_interval_days)) at time zone v_timezone;
  end if;
  if v_horizon is null or v_from > v_through then
    raise sqlstate 'PT409' using message = 'planning window expired';
  end if;
  if cardinality(p_before_ids) <> (select count(*) from public.workouts
    where id = any(p_before_ids) and user_id = v_user_id and superseded_at is null
      and scheduled_date between v_from and v_through) then
    raise sqlstate 'PT409' using message = 'replacement includes unavailable or out of window workouts';
  end if;
  if exists(select 1 from unnest(p_before_ids) id where public.workout_has_results(id)) then
    raise sqlstate 'PT409' using message = 'performed workouts cannot be replaced';
  end if;
  if exists(select 1 from jsonb_array_elements(p_workouts) w
    where jsonb_typeof(w) <> 'object' or w->>'scheduled_date' is null
      or (w->>'scheduled_date')::date not between v_from and v_through
      or w->>'name' is null or jsonb_typeof(w->'exercises') is distinct from 'array') then
    raise sqlstate 'PT400' using message = 'invalid workout or workout outside adjustment window';
  end if;
  v_changed := cardinality(p_before_ids) > 0 or jsonb_array_length(p_workouts) > 0
    or v_horizon is distinct from v_schedule.horizon_end;
  if v_changed then
    update public.planning_changes set status = 'discarded'
    where user_id = v_user_id and status = 'undone';
    insert into public.planning_changes(id, user_id, revision, kind, reason,
      effective_from, effective_through, horizon_end_before, horizon_end_after)
    values(p_job_id, v_user_id, v_schedule.revision + 1, v_job.kind, v_job.reason,
      v_from, v_through, v_schedule.horizon_end, v_horizon);
    insert into public.planning_change_workouts(change_id, workout_id, user_id, side)
    select p_job_id, id, v_user_id, 'before' from unnest(p_before_ids) id;
    update public.workouts set superseded_at = clock_timestamp() where id = any(p_before_ids);
    for v_workout in select value from jsonb_array_elements(p_workouts) loop
      insert into public.workouts(user_id, created_by_change_id, scheduled_date, name, notes)
      values(v_user_id, p_job_id, (v_workout->>'scheduled_date')::date,
        v_workout->>'name', v_workout->>'notes') returning id into v_wid;
      insert into public.planning_change_workouts(change_id, workout_id, user_id, side)
      values(p_job_id, v_wid, v_user_id, 'after');
      for v_exercise, v_eorder in
        select value, ordinality - 1 from jsonb_array_elements(v_workout->'exercises') with ordinality
      loop
        if jsonb_typeof(v_exercise->'sets') is distinct from 'array' then
          raise sqlstate 'PT400' using message = 'exercise sets must be an array';
        end if;
        insert into public.exercises(workout_id, order_index, name, reps_per_side, weight_unit, distance_unit, notes)
        values(v_wid, v_eorder, v_exercise->>'name', coalesce((v_exercise->>'reps_per_side')::boolean, false),
          v_exercise->>'weight_unit', v_exercise->>'distance_unit', v_exercise->>'notes') returning id into v_eid;
        for v_set, v_sorder in
          select value, ordinality - 1 from jsonb_array_elements(v_exercise->'sets') with ordinality
        loop
          if jsonb_typeof(v_set) <> 'object' then
            raise sqlstate 'PT400' using message = 'set must be an object';
          end if;
          insert into public.exercise_sets(exercise_id, order_index, planned_reps, planned_weight,
            planned_distance, planned_duration_seconds, planned_rpe, planned_rest_seconds, planned_notes)
          values(v_eid, v_sorder, (v_set->>'planned_reps')::integer, (v_set->>'planned_weight')::numeric,
            (v_set->>'planned_distance')::numeric, (v_set->>'planned_duration_seconds')::integer,
            (v_set->>'planned_rpe')::numeric, (v_set->>'planned_rest_seconds')::integer, v_set->>'planned_notes');
        end loop;
      end loop;
    end loop;
  end if;
  if v_job.lease_expires_at <= clock_timestamp() then
    raise sqlstate 'PT409' using message = 'job lease expired during publication';
  end if;
  update public.planning_schedules set horizon_end = v_horizon, next_refresh_at = v_next,
    revision = revision + 1 where user_id = v_user_id returning * into v_schedule;
  update public.replan_jobs set status = 'succeeded', completed_at = clock_timestamp(),
    change_id = case when v_changed then p_job_id else null end,
    lease_token = null, lease_expires_at = null where id = p_job_id;
  select coalesce(jsonb_agg(workout_id order by workout_id), '[]') into v_ids
  from public.planning_change_workouts where change_id = p_job_id and side = 'after';
  return jsonb_build_object('change_id', case when v_changed then p_job_id else null end,
    'workout_ids', v_ids, 'revision', v_schedule.revision);
end;
$$;

-- Explicit target and revision prevent a retried click from undoing a second change.
create or replace function public.set_planning_change_applied(
  p_user_id uuid, p_change_id uuid, p_expected_revision bigint, p_applied boolean
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_change public.planning_changes;
  v_target uuid; v_active_side text; v_ids jsonb;
begin
  if p_applied is null then raise sqlstate 'PT400' using message = 'applied is required'; end if;
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found then raise sqlstate 'PT404' using message = 'planning schedule not found'; end if;
  if v_schedule.revision is distinct from p_expected_revision then
    raise sqlstate 'PT409' using message = 'schedule revision changed';
  end if;
  select * into v_change from public.planning_changes where id = p_change_id and user_id = p_user_id;
  if not found then raise sqlstate 'PT404' using message = 'planning change not found'; end if;
  if p_applied then
    select id into v_target from public.planning_changes where user_id = p_user_id and status = 'undone'
    order by revision limit 1;
    v_active_side := 'before';
  else
    select id into v_target from public.planning_changes where user_id = p_user_id and status = 'applied'
    order by revision desc limit 1;
    v_active_side := 'after';
  end if;
  if v_target is distinct from p_change_id then
    raise sqlstate 'PT409' using message = 'changes must be undone or redone in chronological order';
  end if;
  if exists(select 1 from public.planning_change_workouts l join public.workouts w on w.id = l.workout_id
    where l.change_id = p_change_id and
      (public.workout_has_results(w.id) or ((l.side = v_active_side) <> (w.superseded_at is null)))) then
    raise sqlstate 'PT409' using message = 'workouts have results or their active state changed';
  end if;
  update public.workouts w set superseded_at = case when l.side = v_active_side then clock_timestamp() else null end
  from public.planning_change_workouts l where l.change_id = p_change_id and w.id = l.workout_id;
  update public.planning_changes set status = case when p_applied then 'applied' else 'undone' end
  where id = p_change_id;
  update public.planning_schedules set revision = revision + 1,
    horizon_end = case when p_applied then v_change.horizon_end_after else v_change.horizon_end_before end
  where user_id = p_user_id returning * into v_schedule;
  select coalesce(jsonb_agg(workout_id order by workout_id), '[]') into v_ids
  from public.planning_change_workouts where change_id = p_change_id and side <> v_active_side;
  return jsonb_build_object('change_id', p_change_id, 'workout_ids', v_ids, 'revision', v_schedule.revision);
end;
$$;

create or replace function public.undo_planning_change(p_user_id uuid, p_change_id uuid, p_expected_revision bigint)
returns jsonb language sql security invoker set search_path = pg_catalog, public as $$
  select public.set_planning_change_applied(p_user_id, p_change_id, p_expected_revision, false);
$$;

create or replace function public.redo_planning_change(p_user_id uuid, p_change_id uuid, p_expected_revision bigint)
returns jsonb language sql security invoker set search_path = pg_catalog, public as $$
  select public.set_planning_change_applied(p_user_id, p_change_id, p_expected_revision, true);
$$;

-- Prevent browser REST writes from bypassing revisions, history, and result guards.
revoke insert, update, delete on public.workouts, public.exercises, public.exercise_sets,
  public.planning_changes from authenticated;
grant all on public.profiles, public.onboarding_responses, public.sports_workouts,
  public.planning_schedules, public.planning_changes, public.planning_change_workouts,
  public.workouts, public.exercises, public.exercise_sets, public.replan_jobs to service_role;

-- Restrict exactly this migration's functions, including internal helpers.
do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'configure_planning_schedule', 'enqueue_adjustment', 'enqueue_due_replans', 'claim_replan_job',
      'renew_replan_lease', 'fail_replan_job', 'cancel_replan_job', 'retry_replan_job', 'purge_replan_jobs', 'invalidate_planning_inputs',
      'workout_has_results', 'complete_replan_job', 'set_planning_change_applied',
      'undo_planning_change', 'redo_planning_change', 'record_workout_results', 'bump_planning_input_revision'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
