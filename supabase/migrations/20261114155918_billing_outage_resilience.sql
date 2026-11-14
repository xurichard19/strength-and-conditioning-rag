-- Existing rows receive no outage allowance until a successful paid verification.
alter table public.billing_entitlements
  add column outage_access_until timestamptz,
  add column verification_retry_at timestamptz,
  add constraint billing_finite_outage_dates check (
    (outage_access_until is null or isfinite(outage_access_until))
    and (verification_retry_at is null or isfinite(verification_retry_at))
  );

-- Routine refreshes retain the last paid allowance. Webhooks use the separate
-- invalidation below, which removes it. Neither operation grants fresh access.
create function public.claim_billing_verification(
  p_user_id uuid, p_environment text, p_entitlement_key text
) returns setof public.billing_entitlements
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if p_user_id is null or p_environment is null or p_environment not in ('sandbox', 'production')
    or p_entitlement_key is distinct from 'arcel_pro' then
    raise sqlstate 'PT400' using message = 'invalid billing verification claim';
  end if;
  return query
    insert into public.billing_entitlements as current (
      user_id, environment, entitlement_key, sync_revision
    )
    select p.id, p_environment, p_entitlement_key, 1
    from public.profiles p where p.id = p_user_id
    on conflict (user_id, environment, entitlement_key) do update
      set verified_at = null, verification_retry_at = null,
          sync_revision = current.sync_revision + 1, updated_at = clock_timestamp()
    returning current.*;
end;
$$;

-- Only a transient failure for the still-current claim may start the cooldown.
-- Replays cannot extend either the cooldown or the paid access allowance.
create function public.defer_billing_verification(
  p_user_id uuid, p_environment text, p_entitlement_key text, p_expected_revision bigint
) returns setof public.billing_entitlements
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if p_user_id is null or p_environment is null or p_environment not in ('sandbox', 'production')
    or p_entitlement_key is distinct from 'arcel_pro'
    or p_expected_revision is null or p_expected_revision < 1 then
    raise sqlstate 'PT400' using message = 'invalid billing verification deferral';
  end if;
  return query
    update public.billing_entitlements as current
    set verification_retry_at = clock_timestamp() + interval '60 seconds',
        updated_at = clock_timestamp()
    where current.user_id = p_user_id and current.environment = p_environment
      and current.entitlement_key = p_entitlement_key and current.sync_revision = p_expected_revision
      and current.verified_at is null and current.verification_retry_at is null
    returning current.*;
end;
$$;

-- Keep the existing webhook RPC signature and deterministic transfer lock order.
-- Every webhook requires successful verification before outage access can resume.
create or replace function public.invalidate_billing_entitlements(
  p_user_ids uuid[], p_environment text, p_entitlement_key text
) returns setof public.billing_entitlements
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if p_user_ids is null or cardinality(p_user_ids) > 100
    or p_environment is null or p_environment not in ('sandbox', 'production')
    or p_entitlement_key is distinct from 'arcel_pro' then
    raise sqlstate 'PT400' using message = 'invalid billing invalidation';
  end if;
  return query
    insert into public.billing_entitlements as current (
      user_id, environment, entitlement_key, sync_revision
    )
    select p.id, p_environment, p_entitlement_key, 1
    from public.profiles p where p.id = any(p_user_ids) order by p.id
    on conflict (user_id, environment, entitlement_key) do update
      set verified_at = null, outage_access_until = null, verification_retry_at = null,
          sync_revision = current.sync_revision + 1, updated_at = clock_timestamp()
    returning current.*;
end;
$$;

-- Preserve the schedule-before-entitlement lock order and the atomic planning
-- wake. Only successful paid verification establishes a new outage deadline.
create or replace function public.commit_billing_entitlement(
  p_user_id uuid, p_environment text, p_entitlement_key text,
  p_expected_revision bigint, p_snapshot jsonb
) returns setof public.billing_entitlements
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_schedule public.planning_schedules; v_saved public.billing_entitlements;
  v_verified_at timestamptz;
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
  v_verified_at := clock_timestamp();
  update public.billing_entitlements as current
  set product_id = p_snapshot ->> 'product_id', store = p_snapshot ->> 'store',
    period_type = p_snapshot ->> 'period_type', active = (p_snapshot ->> 'active')::boolean,
    expires_at = (p_snapshot ->> 'expires_at')::timestamptz,
    grace_expires_at = (p_snapshot ->> 'grace_expires_at')::timestamptz,
    will_renew = (p_snapshot ->> 'will_renew')::boolean,
    verified_at = v_verified_at, updated_at = v_verified_at,
    outage_access_until = case
      when (p_snapshot ->> 'active')::boolean
        and lower(p_snapshot ->> 'period_type') in ('normal', 'intro')
        and (p_snapshot ->> 'expires_at')::timestamptz > v_verified_at
      then least(v_verified_at + interval '24 hours', (p_snapshot ->> 'expires_at')::timestamptz)
      else null end,
    verification_retry_at = null
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

revoke all on function public.claim_billing_verification(uuid, text, text),
  public.defer_billing_verification(uuid, text, text, bigint)
from public, anon, authenticated;
grant execute on function public.claim_billing_verification(uuid, text, text),
  public.defer_billing_verification(uuid, text, text, bigint)
to service_role;

notify pgrst, 'reload schema';
