-- Three weeks of coverage, extended weekly; existing custom schedules retain their cadence.
alter table public.planning_schedules alter column horizon_days set default 21;
update public.planning_schedules set horizon_days = 21, revision = revision + 1
where horizon_days = 7 and refresh_interval_days = 7;
alter table public.replan_jobs add column claimed_on date;


create or replace function public.configure_planning_schedule(
  p_user_id uuid, p_next_refresh_at timestamptz,
  p_horizon_days integer default 21, p_refresh_interval_days integer default 7
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

create or replace function public.claim_replan_delivery(p_job_id uuid, p_delivery_token uuid, p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs; v_schedule public.planning_schedules; v_user uuid; v_first uuid;
  v_today date; v_timezone text; v_from date; v_through date; v_horizon date;
begin
  if p_job_id is null or p_delivery_token is null or p_lease_seconds is null
    or p_lease_seconds not between 30 and 3600 then
    raise sqlstate 'PT400' using message = 'job, delivery token, and valid lease required';
  end if;
  select user_id into v_user from public.replan_jobs where id = p_job_id;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  select * into v_schedule from public.planning_schedules where user_id = v_user for update;
  select * into v_job from public.replan_jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if v_job.delivery_token <> p_delivery_token then return jsonb_build_object('status', 'obsolete'); end if;
  if v_job.status in ('succeeded', 'failed', 'cancelled') then return jsonb_build_object('status', 'terminal'); end if;
  if v_job.available_at > clock_timestamp() then return jsonb_build_object('status', 'not_ready'); end if;
  -- Preserve per-user serialization and ready-job ordering without claiming another task's job.
  select id into v_first from public.replan_jobs where user_id = v_user
    and (status = 'running' or status = 'pending' and available_at <= clock_timestamp())
  order by (status = 'running') desc, available_at, id limit 1;
  if v_first <> p_job_id or v_job.lease_expires_at > clock_timestamp() then
    return jsonb_build_object('status', 'busy');
  end if;
  if v_job.attempts >= 5 then
    update public.replan_jobs set status = 'failed', error = 'attempt limit reached',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = p_job_id;
    return jsonb_build_object('status', 'terminal');
  end if;
  select timezone into v_timezone from public.profiles where id = v_user;
  v_today := (clock_timestamp() at time zone v_timezone)::date;
  if v_job.kind = 'adjustment' then
    v_from := greatest(v_today, v_job.effective_from);
    v_through := least(v_job.effective_through, v_schedule.horizon_end);
    v_horizon := v_schedule.horizon_end;
  else
    -- Append uncovered dates; a delayed worker restores coverage from its claim date.
    v_from := greatest(v_today, v_schedule.horizon_end + 1);
    v_horizon := greatest(v_schedule.horizon_end, v_today + v_schedule.horizon_days - 1);
    v_through := v_horizon;
  end if;
  if v_horizon is null or (v_job.kind = 'adjustment' and v_from > v_through) then
    update public.replan_jobs set status = 'cancelled', error = 'planning window expired',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = p_job_id;
    return jsonb_build_object('status', 'terminal');
  end if;
  update public.replan_jobs set status = 'running', attempts = attempts + 1,
    expected_revision = v_schedule.revision, claimed_on = v_today, lease_token = gen_random_uuid(),
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), error = null
  where id = p_job_id returning * into v_job;
  return jsonb_build_object('status', 'claimed', 'claim', jsonb_build_object('job', to_jsonb(v_job),
    'effective_from', v_from, 'effective_through', v_through, 'horizon_end', v_horizon));
end;
$$;

-- Keep legacy callers on the same claim/window rules as targeted Cloud Tasks delivery.
create or replace function public.claim_replan_job(p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_user uuid; v_job public.replan_jobs; v_result jsonb;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise sqlstate 'PT400' using message = 'lease must be between 30 and 3600 seconds';
  end if;
  for v_user in
    select ready.user_id from public.replan_jobs ready
    where (ready.status = 'pending' and ready.available_at <= clock_timestamp()
      or ready.status = 'running' and ready.lease_expires_at <= clock_timestamp())
      and not exists(select 1 from public.replan_jobs j where j.user_id = ready.user_id
        and j.status = 'running' and j.lease_expires_at > clock_timestamp())
    group by ready.user_id order by min(ready.available_at), ready.user_id
  loop
    perform 1 from public.planning_schedules where user_id = v_user for update skip locked;
    if not found then continue; end if;
    select * into v_job from public.replan_jobs where user_id = v_user
      and (status = 'running' or status = 'pending' and available_at <= clock_timestamp())
    order by (status = 'running') desc, available_at, id limit 1;
    if not found then continue; end if;
    v_result := public.claim_replan_delivery(v_job.id, v_job.delivery_token, p_lease_seconds);
    if v_result->>'status' = 'claimed' then return v_result->'claim'; end if;
  end loop;
  return null;
end;
$$;

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
  if v_job.claimed_on is distinct from (clock_timestamp() at time zone v_timezone)::date then
    raise sqlstate 'PT409' using message = 'local date changed; regenerate the proposal';
  end if;
  v_from := v_job.claimed_on;
  v_next := v_schedule.next_refresh_at;
  if v_job.kind = 'adjustment' then
    v_from := greatest(v_from, v_job.effective_from);
    v_horizon := v_schedule.horizon_end;
    v_through := least(v_job.effective_through, v_horizon);
  else
    if cardinality(p_before_ids) > 0 then
      raise sqlstate 'PT400' using message = 'refreshes cannot replace existing workouts';
    end if;
    v_from := greatest(v_job.claimed_on, v_schedule.horizon_end + 1);
    v_horizon := greatest(v_schedule.horizon_end, v_job.claimed_on + v_schedule.horizon_days - 1);
    v_through := v_horizon;
    v_next := ((v_job.scheduled_for at time zone v_timezone)
      + make_interval(days => v_schedule.refresh_interval_days)) at time zone v_timezone;
  end if;
  if v_horizon is null or (v_job.kind = 'adjustment' and v_from > v_through) then
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
  if v_job.lease_expires_at <= clock_timestamp()
    or v_job.claimed_on is distinct from (clock_timestamp() at time zone v_timezone)::date then
    raise sqlstate 'PT409' using message = 'job lease or local date expired during publication';
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

-- The sport write and its durable job commit together, including authenticated RLS writes.
-- Workers lock schedules/jobs/workouts, never sports rows; the trigger locks the schedule before jobs.
create function public.replan_after_sport_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid; v_id uuid; v_schedule public.planning_schedules; v_today date;
  v_old_date date; v_new_date date; v_from date; v_through date;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise sqlstate 'PT400' using message = 'sport workout owner cannot change';
    end if;
    if (to_jsonb(new) - array['id', 'created_at', 'updated_at'])
      = (to_jsonb(old) - array['id', 'created_at', 'updated_at']) then return null; end if;
  end if;
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;
  update public.planning_schedules set revision = revision + 1 where user_id = v_user
  returning * into v_schedule;
  if not found or v_schedule.horizon_end is null then return null; end if;
  -- Completion/results invalidate an in-flight read but do not create a new automatic trigger.
  if tg_op = 'UPDATE' and
    (new.sport, new.scheduled_date, new.start_time, new.planned_duration_minutes,
      new.intensity, new.notes, new.status = 'cancelled') is not distinct from
    (old.sport, old.scheduled_date, old.start_time, old.planned_duration_minutes,
      old.intensity, old.notes, old.status = 'cancelled') then return null; end if;
  if tg_op <> 'INSERT' and old.status <> 'cancelled' then v_old_date := old.scheduled_date; end if;
  if tg_op <> 'DELETE' and new.status <> 'cancelled' then v_new_date := new.scheduled_date; end if;
  select (clock_timestamp() at time zone timezone)::date into v_today from public.profiles where id = v_user;
  if not found then return null; end if; -- Account deletion must not enqueue cascading work.
  if v_old_date not between v_today - 3 and v_schedule.horizon_end + 3 then v_old_date := null; end if;
  if v_new_date not between v_today - 3 and v_schedule.horizon_end + 3 then v_new_date := null; end if;
  if v_old_date is null and v_new_date is null then return null; end if;
  v_from := greatest(v_today, least(v_old_date, v_new_date) - 3);
  v_through := least(v_schedule.horizon_end, greatest(v_old_date, v_new_date) + 3);
  if v_from > v_through then return null; end if;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, effective_from, effective_through)
  values(v_user, 'adjustment', 'sport schedule changed',
    'sport:' || v_id::text || ':' || v_schedule.revision::text, v_from, v_through);
  return null;
end;
$$;
drop trigger sports_planning_revision on public.sports_workouts;
create trigger sports_planning_revision after insert or update or delete on public.sports_workouts
for each row execute function public.replan_after_sport_change();
revoke all on function public.replan_after_sport_change() from public, anon, authenticated;

notify pgrst, 'reload schema';
