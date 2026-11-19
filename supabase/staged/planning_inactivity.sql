-- Apply in a transaction only after foreground activity reporting is deployed
-- across supported app versions. This is intentionally outside automatic migrations.
-- Existing installs start with a 21-day grace baseline from the activity migration.
-- Billing bypass flags never bypass inactivity; explicit adjustments retain access
-- to their normal billing/lease rules. No job is cancelled and no attempt is reset.

create or replace function public.enqueue_planning_refresh(p_user_id uuid)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_due timestamptz; v_count integer;
begin
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found or v_schedule.next_refresh_at > clock_timestamp() then return 0; end if;
  if not public.planning_activity_allowed(p_user_id) then return 0; end if;
  if exists(select 1 from public.replan_jobs where user_id = p_user_id and kind = 'refresh'
    and status in ('pending', 'running')) then return 0; end if;
  -- An exhausted first plan remains visible until an explicit retry; it must not
  -- silently start a fresh attempt budget at the next weekly cadence boundary.
  if v_schedule.horizon_end is null and exists(select 1 from public.replan_jobs
    where user_id = p_user_id and kind = 'refresh' and status in ('failed', 'cancelled')) then
    return 0;
  end if;
  select public.latest_refresh_occurrence(v_schedule.next_refresh_at,
    v_schedule.refresh_interval_days, timezone, clock_timestamp()) into v_due
  from public.profiles where id = p_user_id;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for)
  values(p_user_id, 'refresh', 'scheduled refresh',
    'refresh:' || extract(epoch from v_due)::text, v_due)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.enqueue_due_replans(p_limit integer default 100, p_include_paused boolean default false)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_candidate uuid; v_count integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 1000';
  end if;
  for v_candidate in
    select s.user_id from public.planning_schedules s join public.profiles p on p.id = s.user_id
    cross join lateral (
      select public.latest_refresh_occurrence(s.next_refresh_at, s.refresh_interval_days,
        p.timezone, clock_timestamp()) as due_at
    ) occurrence
    where p.last_active_at > statement_timestamp() - interval '504 hours'
      and s.next_refresh_at <= clock_timestamp()
      and (p_include_paused or s.billing_pause_reason is null)
      and not exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
        and j.kind = 'refresh' and (j.status in ('pending', 'running')
          or j.scheduled_for = occurrence.due_at
          or j.deduplication_key = 'refresh:' || extract(epoch from occurrence.due_at)::text
          or s.horizon_end is null and j.status in ('failed', 'cancelled')))
    order by s.next_refresh_at, s.user_id limit p_limit for update of s skip locked
  loop
    v_count := v_count + public.enqueue_planning_refresh(v_candidate);
  end loop;
  return v_count;
end;
$$;

create or replace function public.list_replan_deliveries(p_limit integer default 20, p_include_paused boolean default false)
returns setof public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 100';
  end if;
  return query select j.* from public.replan_jobs j
  join public.planning_schedules s on s.user_id = j.user_id
  join public.profiles p on p.id = j.user_id
  where (p_include_paused or s.billing_pause_reason is null)
    and (j.kind <> 'refresh' or p.last_active_at > statement_timestamp() - interval '504 hours')
    and (j.status = 'pending' and j.available_at <= clock_timestamp()
      or j.status = 'running' and j.lease_expires_at <= clock_timestamp())
    and (j.dispatched_at is null or j.dispatched_at < clock_timestamp() - interval '10 minutes')
  order by j.dispatched_at nulls first, j.available_at, j.id limit p_limit;
end;
$$;

create or replace function public.claim_replan_delivery(
  p_job_id uuid, p_delivery_token uuid, p_lease_seconds integer default 300,
  p_billing_environment text default null, p_billing_revision bigint default null
)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs; v_schedule public.planning_schedules; v_user uuid; v_first uuid;
  v_today date; v_timezone text; v_from date; v_through date; v_horizon date; v_access text;
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
  -- Retire a delayed inactive delivery before spending an attempt. Existing
  -- workers acknowledge obsolete tokens; a return will submit the new generation.
  -- A duplicate of a live lease still follows the busy path below.
  if v_job.kind = 'refresh' and not public.planning_activity_allowed(v_user)
    and not (v_job.status = 'running' and v_job.lease_expires_at > clock_timestamp()) then
    update public.replan_jobs set status = 'pending', delivery_token = gen_random_uuid(),
      dispatched_at = null, dispatch_recoveries = 0, lease_token = null,
      lease_expires_at = null, expected_revision = null where id = p_job_id;
    return jsonb_build_object('status', 'obsolete');
  end if;
  if v_job.kind = 'adjustment' and not public.planning_activity_allowed(v_user) then
    -- An expired refresh lease must not occupy the one-running-job slot while
    -- its inactive delivery is excluded from recovery. Fence that old worker.
    update public.replan_jobs set status = 'pending', delivery_token = gen_random_uuid(),
      dispatched_at = null, dispatch_recoveries = 0, lease_token = null,
      lease_expires_at = null, expected_revision = null
    where user_id = v_user and kind = 'refresh' and status = 'running'
      and lease_expires_at <= clock_timestamp();
  end if;
  -- Preserve per-user serialization and ready-job ordering without claiming another task's job.
  select id into v_first from public.replan_jobs where user_id = v_user
    and (status = 'running' or status = 'pending' and available_at <= clock_timestamp())
    and (kind <> 'refresh' or public.planning_activity_allowed(v_user)
      or status = 'running' and lease_expires_at > clock_timestamp())
  order by (status = 'running') desc, available_at, id limit 1;
  if v_first <> p_job_id or v_job.lease_expires_at > clock_timestamp() then
    return jsonb_build_object('status', 'busy');
  end if;
  -- Authorization is fenced before consuming a generation attempt. A previously
  -- authorized live lease remains busy above and may finish without reauthorization.
  v_access := public.planning_billing_status(v_user, p_billing_environment, p_billing_revision);
  if v_access <> 'allowed' then return jsonb_build_object('status', v_access); end if;
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

create or replace function public.claim_replan_job(p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_user_id uuid; v_job public.replan_jobs; v_schedule public.planning_schedules;
  v_now timestamptz := clock_timestamp();
  v_today date; v_timezone text; v_from date; v_through date; v_horizon date;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise sqlstate 'PT400' using message = 'lease must be between 30 and 3600 seconds';
  end if;
  -- Start from ready jobs, not every athlete; keep schedule-first lock ordering.
  for v_user_id in
    select ready.user_id from (
      select user_id, available_at, kind from public.replan_jobs
      where status = 'pending' and available_at <= v_now
      union all
      select user_id, available_at, kind from public.replan_jobs
      where status = 'running' and lease_expires_at <= v_now
    ) ready join public.profiles p on p.id = ready.user_id
    where (ready.kind <> 'refresh' or p.last_active_at > statement_timestamp() - interval '504 hours')
      and not exists (select 1 from public.replan_jobs j where j.user_id = ready.user_id
      and j.status = 'running' and j.lease_expires_at > v_now)
    group by ready.user_id order by min(ready.available_at), ready.user_id
  loop
    select * into v_schedule from public.planning_schedules
    where user_id = v_user_id for update skip locked;
    exit when found;
  end loop;
  if v_schedule.user_id is null then return null; end if;
  if not public.planning_activity_allowed(v_user_id) then
    update public.replan_jobs set status = 'pending', delivery_token = gen_random_uuid(),
      dispatched_at = null, dispatch_recoveries = 0, lease_token = null,
      lease_expires_at = null, expected_revision = null
    where user_id = v_user_id and kind = 'refresh' and status = 'running'
      and lease_expires_at <= clock_timestamp();
  end if;
  -- Lock/recheck a running job first, including a concurrently renewed lease.
  select * into v_job from public.replan_jobs where user_id = v_user_id
    and (status = 'running' or (status = 'pending' and available_at <= v_now))
    and (kind <> 'refresh' or public.planning_activity_allowed(v_user_id)
      or status = 'running' and lease_expires_at > clock_timestamp())
  order by (status = 'running') desc, available_at, id limit 1 for update;
  if not found or (v_job.status = 'running' and v_job.lease_expires_at > clock_timestamp()) then
    return null;
  end if;
  if v_job.kind = 'refresh' and not public.planning_activity_allowed(v_user_id) then return null; end if;
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

create or replace function public.list_planning_billing_work(p_limit integer default 20)
returns table(user_id uuid, wake_token uuid)
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 20';
  end if;
  return query
  with wakeups as (
    select s.user_id, s.billing_wake_token, s.billing_recheck_at, 0 as lane
    from public.planning_schedules s
    join public.onboarding_responses o on o.user_id = s.user_id and o.completed_at is not null
    join public.profiles p on p.id = s.user_id
    where s.billing_wake_token is not null
      and (s.billing_recheck_at is null or s.billing_recheck_at <= clock_timestamp())
      and (p.last_active_at > statement_timestamp() - interval '504 hours'
        or exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
          and j.kind = 'adjustment' and j.status in ('pending', 'running')))
    order by s.billing_recheck_at nulls first, s.user_id limit p_limit
  ), retries as (
    select s.user_id, s.billing_wake_token, s.billing_recheck_at, 1 as lane
    from public.planning_schedules s
    join public.onboarding_responses o on o.user_id = s.user_id and o.completed_at is not null
    join public.profiles p on p.id = s.user_id
    where s.billing_wake_token is null and s.billing_pause_reason = 'billing_unavailable'
      and s.billing_recheck_at <= clock_timestamp()
      and (p.last_active_at > statement_timestamp() - interval '504 hours'
        or exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
          and j.kind = 'adjustment' and j.status in ('pending', 'running')))
    order by s.billing_recheck_at, s.user_id limit p_limit
  ), ranked as (
    select c.*, row_number() over(partition by c.lane
      order by c.billing_recheck_at nulls first, c.user_id) as position
    from (select * from wakeups union all select * from retries) c
  )
  select r.user_id, r.billing_wake_token from ranked r
  -- Half each when both lanes are full; unused capacity automatically goes to
  -- the other lane. An odd final place favors an explicit event.
  order by r.position, r.lane limit p_limit;
end;
$$;

create or replace function public.list_planning_billing_rechecks(p_limit integer default 20)
returns setof uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 100';
  end if;
  return query select s.user_id from public.planning_schedules s
  join public.onboarding_responses o on o.user_id = s.user_id and o.completed_at is not null
  join public.profiles p on p.id = s.user_id
  where (s.billing_recheck_at is null or s.billing_recheck_at <= clock_timestamp())
    and (
      exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
        and (j.status = 'pending' or j.status = 'running' and j.lease_expires_at <= clock_timestamp()))
      or s.next_refresh_at <= clock_timestamp() and (s.horizon_end is not null
        or not exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
          and j.kind = 'refresh' and j.status in ('failed', 'cancelled')))
    )
      and (p.last_active_at > statement_timestamp() - interval '504 hours'
        or exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
          and j.kind = 'adjustment' and j.status in ('pending', 'running')))
  order by s.billing_recheck_at nulls first, s.user_id limit p_limit;
end;
$$;

notify pgrst, 'reload schema';
