-- Durable delivery metadata; existing leases and publication remain authoritative.
alter table public.replan_jobs
  add column delivery_token uuid not null default gen_random_uuid(),
  add column dispatched_at timestamptz,
  add column dispatch_recoveries smallint not null default 0 check (dispatch_recoveries between 0 and 1);

create index replan_jobs_delivery_idx on public.replan_jobs(dispatched_at nulls first, available_at, id)
where status in ('pending', 'running');

create function public.reset_replan_delivery() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.status in ('failed', 'cancelled') and new.status = 'pending' then
    new.delivery_token := gen_random_uuid();
    new.dispatched_at := null;
    new.dispatch_recoveries := 0;
  end if;
  return new;
end;
$$;
create trigger reset_replan_delivery before update on public.replan_jobs
for each row execute function public.reset_replan_delivery();

create function public.list_replan_deliveries(p_limit integer default 20)
returns setof public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 100';
  end if;
  return query select j.* from public.replan_jobs j
  where (j.status = 'pending' and j.available_at <= clock_timestamp()
      or j.status = 'running' and j.lease_expires_at <= clock_timestamp())
    and (j.dispatched_at is null or j.dispatched_at < clock_timestamp() - interval '10 minutes')
  order by j.dispatched_at nulls first, j.available_at, j.id limit p_limit;
end;
$$;

-- Timestamp is the last confirmed submission/existence check, which also rotates scan order.
create function public.mark_replan_dispatched(p_job_id uuid, p_delivery_token uuid)
returns void language sql security invoker set search_path = pg_catalog, public as $$
  update public.replan_jobs set dispatched_at = clock_timestamp()
  where id = p_job_id and delivery_token = p_delivery_token and status in ('pending', 'running');
$$;

-- Call only after Cloud Tasks confirms NotFound, never after a timeout or access error.
create function public.recover_replan_delivery(p_job_id uuid, p_delivery_token uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs; v_user uuid;
begin
  select user_id into v_user from public.replan_jobs where id = p_job_id;
  perform 1 from public.planning_schedules where user_id = v_user for update;
  select * into v_job from public.replan_jobs where id = p_job_id for update;
  if not found or v_job.delivery_token <> p_delivery_token or v_job.status not in ('pending', 'running')
    or v_job.dispatched_at is null or v_job.dispatched_at >= clock_timestamp() - interval '10 minutes'
    or v_job.lease_expires_at > clock_timestamp() then return null; end if;
  if v_job.dispatch_recoveries = 1 then
    update public.replan_jobs set status = 'failed', error = 'task delivery exhausted',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null
    where id = p_job_id returning * into v_job;
  else
    update public.replan_jobs set status = 'pending', delivery_token = gen_random_uuid(),
      dispatched_at = null, dispatch_recoveries = 1, lease_token = null, lease_expires_at = null,
      expected_revision = null
    where id = p_job_id returning * into v_job;
  end if;
  return to_jsonb(v_job);
end;
$$;

create function public.claim_replan_delivery(p_job_id uuid, p_delivery_token uuid, p_lease_seconds integer default 300)
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
    -- Keep the existing publication RPC's date contract; graph/calendar changes come separately.
    v_from := v_today;
    v_horizon := greatest(v_schedule.horizon_end,
      (v_job.scheduled_for at time zone v_timezone)::date + v_schedule.horizon_days - 1);
    v_through := v_horizon;
  end if;
  if v_horizon is null or v_from > v_through then
    update public.replan_jobs set status = 'cancelled', error = 'planning window expired',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = p_job_id;
    return jsonb_build_object('status', 'terminal');
  end if;
  update public.replan_jobs set status = 'running', attempts = attempts + 1,
    expected_revision = v_schedule.revision, lease_token = gen_random_uuid(),
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), error = null
  where id = p_job_id returning * into v_job;
  return jsonb_build_object('status', 'claimed', 'claim', jsonb_build_object('job', to_jsonb(v_job),
    'effective_from', v_from, 'effective_through', v_through, 'horizon_end', v_horizon));
end;
$$;

revoke all on function public.reset_replan_delivery() from public, anon, authenticated;
revoke all on function public.list_replan_deliveries(integer), public.mark_replan_dispatched(uuid, uuid),
  public.recover_replan_delivery(uuid, uuid), public.claim_replan_delivery(uuid, uuid, integer)
from public, anon, authenticated;
grant execute on function public.list_replan_deliveries(integer), public.mark_replan_dispatched(uuid, uuid),
  public.recover_replan_delivery(uuid, uuid), public.claim_replan_delivery(uuid, uuid, integer) to service_role;
