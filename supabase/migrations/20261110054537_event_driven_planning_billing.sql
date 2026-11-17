-- A wake is durable intent, not authorization. The nullable UUID lets a consumer
-- acknowledge exactly its observed event without consuming a newer notification.
alter table public.planning_schedules add column billing_wake_token uuid;

-- Revisit existing pauses once when switching away from periodic unpaid polling.
update public.planning_schedules set billing_wake_token = gen_random_uuid(),
  billing_recheck_at = clock_timestamp() where billing_pause_reason is not null;

create index planning_billing_work_idx on public.planning_schedules(billing_recheck_at, user_id)
where billing_wake_token is not null or billing_pause_reason = 'billing_unavailable';

create or replace function public.request_planning_billing_recheck(p_user_ids uuid[])
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_user_ids is null or cardinality(p_user_ids) > 100 then
    raise sqlstate 'PT400' using message = 'bounded user ids required';
  end if;
  perform 1 from public.planning_schedules where user_id = any(p_user_ids)
  order by user_id for update;
  update public.planning_schedules set billing_wake_token = gen_random_uuid(),
    billing_recheck_at = clock_timestamp() where user_id = any(p_user_ids);
end;
$$;

-- Preserve the old UUID-only RPC for services draining during deployment. New
-- services reconcile only explicit events and timed verification failures;
-- ordinary unpaused refreshes are discovered by enqueue_due_replans instead.
create function public.list_planning_billing_work(p_limit integer default 20)
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
    where s.billing_wake_token is not null
      and (s.billing_recheck_at is null or s.billing_recheck_at <= clock_timestamp())
    order by s.billing_recheck_at nulls first, s.user_id limit p_limit
  ), retries as (
    select s.user_id, s.billing_wake_token, s.billing_recheck_at, 1 as lane
    from public.planning_schedules s
    join public.onboarding_responses o on o.user_id = s.user_id and o.completed_at is not null
    where s.billing_wake_token is null and s.billing_pause_reason = 'billing_unavailable'
      and s.billing_recheck_at <= clock_timestamp()
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

create function public.defer_planning_for_billing(
  p_user_id uuid, p_reason text, p_retry_seconds integer,
  p_billing_environment text default null, p_billing_revision bigint default null,
  p_wake_token uuid default null
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_entitlement public.billing_entitlements;
  v_ack boolean;
begin
  if p_reason is null or p_reason not in ('subscription_required', 'billing_unavailable')
    or (p_reason = 'subscription_required' and p_retry_seconds is not null)
    or (p_reason = 'billing_unavailable' and
      (p_retry_seconds is null or p_retry_seconds not between 1 and 3600)) then
    raise sqlstate 'PT400' using message = 'valid payment wait reason and retry delay required';
  end if;
  if p_reason = 'subscription_required' and (p_billing_environment is null
    or p_billing_environment not in ('sandbox', 'production')
    or p_billing_revision is null or p_billing_revision < 1) then
    raise sqlstate 'PT400' using message = 'verified unpaid entitlement revision required';
  end if;
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found then return true; end if;
  if p_reason = 'subscription_required' then
    -- A late negative response must not put a newly paid account to sleep after
    -- its purchase wake has already been handled. No mutation occurs on rejection.
    select * into v_entitlement from public.billing_entitlements
    where user_id = p_user_id and environment = p_billing_environment and entitlement_key = 'arcel_pro'
    for update;
    if not found or v_entitlement.sync_revision <> p_billing_revision
      or v_entitlement.verified_at is null
      or v_entitlement.verified_at < clock_timestamp() - interval '5 minutes'
      or v_entitlement.verified_at > clock_timestamp() + interval '30 seconds'
      or (v_entitlement.active and lower(coalesce(v_entitlement.period_type, '')) not in ('normal', 'intro', 'trial')
        and (v_entitlement.expires_at is null or v_entitlement.expires_at > clock_timestamp()
          or v_entitlement.grace_expires_at > clock_timestamp()))
      or (v_entitlement.active and v_entitlement.expires_at > clock_timestamp()
        and lower(v_entitlement.period_type) in ('normal', 'intro')) then
      return false;
    end if;
  end if;
  v_ack := p_wake_token is not null and p_wake_token = v_schedule.billing_wake_token;
  update public.planning_schedules set billing_pause_reason = p_reason,
    billing_wake_token = case when v_ack then null else v_schedule.billing_wake_token end,
    billing_recheck_at = case
      when v_schedule.billing_wake_token is not null and not coalesce(v_ack, false)
        then v_schedule.billing_recheck_at
      when p_reason = 'billing_unavailable' then clock_timestamp() + make_interval(secs => p_retry_seconds)
      else null end
  where user_id = p_user_id;
  update public.replan_jobs set status = 'pending', delivery_token = gen_random_uuid(),
    dispatched_at = null, dispatch_recoveries = 0, lease_token = null,
    lease_expires_at = null, expected_revision = null
  where user_id = p_user_id and (status = 'pending'
    or status = 'running' and lease_expires_at <= clock_timestamp());
  return true;
end;
$$;

create function public.resume_planning_after_billing(
  p_user_id uuid, p_billing_environment text default null, p_billing_revision bigint default null,
  p_wake_token uuid default null
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_ack boolean;
begin
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  if not found then return false; end if;
  -- Reuse the existing paid fence, backlog consolidation, and idempotent enqueue.
  if not public.resume_planning(p_user_id, p_billing_environment, p_billing_revision) then return false; end if;
  v_ack := p_wake_token is not null and p_wake_token = v_schedule.billing_wake_token;
  update public.planning_schedules set
    billing_wake_token = case when v_ack then null else v_schedule.billing_wake_token end,
    billing_recheck_at = case
      when v_schedule.billing_wake_token is not null and not coalesce(v_ack, false)
        then v_schedule.billing_recheck_at else null end
  where user_id = p_user_id;
  return true;
end;
$$;

-- The accepted canonical snapshot and its required planning wake commit together.
-- Acquire the schedule before the entitlement, matching worker/deferral ordering.
-- Never acquire job locks while holding entitlement locks here.
create or replace function public.commit_billing_entitlement(
  p_user_id uuid, p_environment text, p_entitlement_key text,
  p_expected_revision bigint, p_snapshot jsonb
) returns setof public.billing_entitlements
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_saved public.billing_entitlements;
begin
  if p_user_id is null or p_environment is null
    or p_environment not in ('sandbox', 'production')
    or p_entitlement_key is distinct from 'arcel_pro'
    or p_expected_revision is null or p_expected_revision < 1
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'active') is distinct from 'boolean' then
    raise sqlstate 'PT400' using message = 'invalid billing snapshot';
  end if;
  select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
  update public.billing_entitlements as current
  set product_id = p_snapshot ->> 'product_id', store = p_snapshot ->> 'store',
    period_type = p_snapshot ->> 'period_type', active = (p_snapshot ->> 'active')::boolean,
    expires_at = (p_snapshot ->> 'expires_at')::timestamptz,
    grace_expires_at = (p_snapshot ->> 'grace_expires_at')::timestamptz,
    will_renew = (p_snapshot ->> 'will_renew')::boolean,
    verified_at = clock_timestamp(), updated_at = clock_timestamp()
  where current.user_id = p_user_id and current.environment = p_environment
    and current.entitlement_key = p_entitlement_key and current.sync_revision = p_expected_revision
    and current.verified_at is null returning current.* into v_saved;
  if not found then return; end if;
  if v_saved.active and v_saved.expires_at > clock_timestamp()
    and lower(v_saved.period_type) in ('normal', 'intro')
    and v_schedule.user_id is not null
    and (v_schedule.billing_pause_reason is not null
      or (v_schedule.horizon_end is null and v_schedule.next_refresh_at <= clock_timestamp()
        and not exists(select 1 from public.replan_jobs where user_id = p_user_id
          and kind = 'refresh' and status in ('failed', 'cancelled')))) then
    update public.planning_schedules set billing_wake_token = coalesce(billing_wake_token, gen_random_uuid()),
      billing_recheck_at = clock_timestamp() where user_id = p_user_id
      and (billing_wake_token is null or billing_recheck_at > clock_timestamp());
  end if;
  return next v_saved;
end;
$$;

create or replace function public.complete_onboarding(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_response public.onboarding_responses; v_was_completed boolean; v_created integer;
begin
  select completed_at is not null into v_was_completed from public.onboarding_responses
  where user_id = p_user_id for update;
  if not found then return null; end if;
  update public.onboarding_responses set completed_at = coalesce(completed_at, clock_timestamp())
  where user_id = p_user_id returning * into v_response;
  insert into public.planning_schedules(user_id, next_refresh_at, billing_wake_token, billing_recheck_at)
  values(p_user_id, clock_timestamp(), gen_random_uuid(), clock_timestamp())
  on conflict (user_id) do nothing;
  get diagnostics v_created = row_count;
  if not v_was_completed and v_created = 0 then
    update public.planning_schedules set billing_wake_token = gen_random_uuid(),
      billing_recheck_at = clock_timestamp() where user_id = p_user_id;
  end if;
  return to_jsonb(v_response);
end;
$$;

revoke all on function public.list_planning_billing_work(integer),
  public.defer_planning_for_billing(uuid, text, integer, text, bigint, uuid),
  public.resume_planning_after_billing(uuid, text, bigint, uuid)
from public, anon, authenticated;
grant execute on function public.list_planning_billing_work(integer),
  public.defer_planning_for_billing(uuid, text, integer, text, bigint, uuid),
  public.resume_planning_after_billing(uuid, text, bigint, uuid)
to service_role;

notify pgrst, 'reload schema';
