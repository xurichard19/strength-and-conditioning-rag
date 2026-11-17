-- Payment waiting is operational metadata, separate from training-input revisions.
alter table public.planning_schedules
  add column billing_pause_reason text check (
    billing_pause_reason in ('subscription_required', 'billing_unavailable')),
  add column billing_recheck_at timestamptz;

create index planning_schedules_billing_recheck_idx
  on public.planning_schedules(billing_recheck_at nulls first, user_id);

-- Call only after taking the schedule/job locks. Provider requests happen outside
-- transactions; the row lock fences a verified revision against concurrent invalidation.
create function public.planning_billing_status(
  p_user_id uuid, p_environment text, p_revision bigint
) returns text language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_entitlement public.billing_entitlements;
begin
  if p_environment is null and p_revision is null then return 'allowed'; end if;
  if p_environment is null or p_environment not in ('sandbox', 'production')
    or p_revision is null or p_revision < 1 then
    raise sqlstate 'PT400' using message = 'billing environment and verification revision required';
  end if;
  if not exists(select 1 from public.onboarding_responses
    where user_id = p_user_id and completed_at is not null) then
    return 'onboarding_required';
  end if;
  select * into v_entitlement from public.billing_entitlements
  where user_id = p_user_id and environment = p_environment and entitlement_key = 'arcel_pro'
  for update;
  if not found or v_entitlement.sync_revision <> p_revision
    or v_entitlement.verified_at is null
    or v_entitlement.verified_at < clock_timestamp() - interval '5 minutes'
    or v_entitlement.verified_at > clock_timestamp() + interval '30 seconds' then
    return 'billing_unavailable';
  end if;
  if not v_entitlement.active or v_entitlement.expires_at is null
    or v_entitlement.expires_at <= clock_timestamp()
    or lower(coalesce(v_entitlement.period_type, '')) not in ('normal', 'intro') then
    return 'billing_required';
  end if;
  return 'allowed';
end;
$$;

-- All refresh creation uses the same per-user idempotency and initial-failure rule.
create function public.enqueue_planning_refresh(p_user_id uuid)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_due timestamptz; v_count integer;
begin
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found or v_schedule.next_refresh_at > clock_timestamp() then return 0; end if;
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

create function public.defer_planning(p_user_id uuid, p_reason text, p_retry_seconds integer)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_reason is null or p_reason not in ('subscription_required', 'billing_unavailable')
    or p_retry_seconds is null or p_retry_seconds not between 1 and 3600 then
    raise sqlstate 'PT400' using message = 'valid payment wait reason and retry delay required';
  end if;
  perform 1 from public.planning_schedules where user_id = p_user_id for update;
  if not found then return; end if;
  update public.planning_schedules set billing_pause_reason = p_reason,
    billing_recheck_at = clock_timestamp() + make_interval(secs => p_retry_seconds)
  where user_id = p_user_id;
  -- Acknowledged tasks must not look like lost deliveries. Retire their tokens;
  -- a future resume submits new generations without spending execution attempts.
  update public.replan_jobs set status = 'pending', delivery_token = gen_random_uuid(),
    dispatched_at = null, dispatch_recoveries = 0, lease_token = null,
    lease_expires_at = null, expected_revision = null
  where user_id = p_user_id and (status = 'pending'
    or status = 'running' and lease_expires_at <= clock_timestamp());
end;
$$;

create function public.request_planning_billing_recheck(p_user_ids uuid[])
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_user_ids is null or cardinality(p_user_ids) > 100 then
    raise sqlstate 'PT400' using message = 'bounded user ids required';
  end if;
  -- Same ordered schedule locking as normal planning writes; never hold billing
  -- locks while acquiring these locks from webhook or verification code.
  perform 1 from public.planning_schedules where user_id = any(p_user_ids)
  order by user_id for update;
  update public.planning_schedules set billing_recheck_at = clock_timestamp()
  where user_id = any(p_user_ids);
end;
$$;

create function public.list_planning_billing_rechecks(p_limit integer default 20)
returns setof uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 100';
  end if;
  return query select s.user_id from public.planning_schedules s
  join public.onboarding_responses o on o.user_id = s.user_id and o.completed_at is not null
  where (s.billing_recheck_at is null or s.billing_recheck_at <= clock_timestamp())
    and (
      exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
        and (j.status = 'pending' or j.status = 'running' and j.lease_expires_at <= clock_timestamp()))
      or s.next_refresh_at <= clock_timestamp() and (s.horizon_end is not null
        or not exists(select 1 from public.replan_jobs j where j.user_id = s.user_id
          and j.kind = 'refresh' and j.status in ('failed', 'cancelled')))
    )
  order by s.billing_recheck_at nulls first, s.user_id limit p_limit;
end;
$$;

create function public.resume_planning(
  p_user_id uuid, p_billing_environment text default null, p_billing_revision bigint default null
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_today date; v_keep uuid;
  v_from date; v_through date; v_count integer;
begin
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found then return false; end if;
  if public.planning_billing_status(p_user_id, p_billing_environment, p_billing_revision) <> 'allowed' then
    return false;
  end if;
  update public.planning_schedules set billing_pause_reason = null,
    billing_recheck_at = clock_timestamp() + interval '5 minutes'
  where user_id = p_user_id;
  if v_schedule.billing_pause_reason is not null then
    select (clock_timestamp() at time zone timezone)::date into v_today
    from public.profiles where id = p_user_id;
    -- Only automatic input edits can be consolidated. Explicit adjustment request
    -- keys/reasons remain intact, including when they were queued before a lapse.
    update public.replan_jobs set status = 'cancelled', completed_at = clock_timestamp(),
      error = 'planning window expired'
    where user_id = p_user_id and status = 'pending' and kind = 'adjustment'
      and (deduplication_key like 'sport:%' or deduplication_key like 'onboarding:%')
      and effective_through < v_today;
    select count(*), min(effective_from), max(effective_through) into v_count, v_from, v_through
    from public.replan_jobs where user_id = p_user_id and status = 'pending' and kind = 'adjustment'
      and (deduplication_key like 'sport:%' or deduplication_key like 'onboarding:%');
    if v_count > 1 then
      select id into v_keep from public.replan_jobs where user_id = p_user_id and status = 'pending'
        and kind = 'adjustment' and (deduplication_key like 'sport:%' or deduplication_key like 'onboarding:%')
      order by created_at, id limit 1;
      update public.replan_jobs set status = 'cancelled', completed_at = clock_timestamp(),
        error = 'automatic changes consolidated after subscription resumed'
      where user_id = p_user_id and status = 'pending' and kind = 'adjustment' and id <> v_keep
        and (deduplication_key like 'sport:%' or deduplication_key like 'onboarding:%');
      update public.replan_jobs set effective_from = greatest(v_today, v_from),
        effective_through = least(v_schedule.horizon_end, v_through), reason = 'training inputs changed',
        delivery_token = gen_random_uuid(), dispatched_at = null, dispatch_recoveries = 0
      where id = v_keep;
    end if;
  end if;
  perform public.enqueue_planning_refresh(p_user_id);
  return true;
end;
$$;

drop function public.enqueue_due_replans(integer);
create function public.enqueue_due_replans(p_limit integer default 100, p_include_paused boolean default false)
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
    where s.next_refresh_at <= clock_timestamp()
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

drop function public.list_replan_deliveries(integer);
create function public.list_replan_deliveries(p_limit integer default 20, p_include_paused boolean default false)
returns setof public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 100';
  end if;
  return query select j.* from public.replan_jobs j
  join public.planning_schedules s on s.user_id = j.user_id
  where (p_include_paused or s.billing_pause_reason is null)
    and (j.status = 'pending' and j.available_at <= clock_timestamp()
      or j.status = 'running' and j.lease_expires_at <= clock_timestamp())
    and (j.dispatched_at is null or j.dispatched_at < clock_timestamp() - interval '10 minutes')
  order by j.dispatched_at nulls first, j.available_at, j.id limit p_limit;
end;
$$;

drop function public.claim_replan_delivery(uuid, uuid, integer);
create function public.claim_replan_delivery(
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
  -- Preserve per-user serialization and ready-job ordering without claiming another task's job.
  select id into v_first from public.replan_jobs where user_id = v_user
    and (status = 'running' or status = 'pending' and available_at <= clock_timestamp())
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

-- A failed first plan can be retried days later. Its claim still computes today's
-- coverage, while an established plan retains the existing obsolete-occurrence guard.
create or replace function public.retry_replan_job(p_user_id uuid, p_job_id uuid)
returns public.replan_jobs language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_job public.replan_jobs;
begin
  perform 1 from public.planning_schedules where user_id = p_user_id for update;
  if exists(select 1 from public.replan_jobs j join public.planning_schedules s on s.user_id = j.user_id
    where j.id = p_job_id and j.user_id = p_user_id and j.kind = 'refresh'
      and j.status in ('failed', 'cancelled') and s.horizon_end is not null
      and j.scheduled_for < s.next_refresh_at) then
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

create or replace function public.purge_replan_jobs(p_before timestamptz, p_limit integer default 1000)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  if p_before is null or p_before > clock_timestamp() - interval '7 days'
    or p_limit is null or p_limit not between 1 and 10000 then
    raise sqlstate 'PT400' using message = 'retain at least seven days and use a limit between 1 and 10000';
  end if;
  with expired as (
    select j.id from public.replan_jobs j
    join public.planning_schedules s on s.user_id = j.user_id
    where j.completed_at < p_before
      and not (s.horizon_end is null and j.kind = 'refresh' and j.status in ('failed', 'cancelled'))
    order by j.completed_at, j.id limit p_limit for update of j skip locked
  ) delete from public.replan_jobs j using expired e where j.id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- No client-supplied billing proof or direct queue operations are accepted.
do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and p.proname in ('planning_billing_status', 'enqueue_planning_refresh', 'defer_planning',
      'request_planning_billing_recheck', 'list_planning_billing_rechecks', 'resume_planning',
      'enqueue_due_replans', 'list_replan_deliveries', 'claim_replan_delivery')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
