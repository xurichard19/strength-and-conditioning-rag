-- Billing verification is independent of profile and training revisions.
create table public.billing_entitlements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  entitlement_key text not null check (entitlement_key = 'arcel_pro'),
  product_id text,
  store text,
  period_type text,
  active boolean not null default false,
  expires_at timestamptz,
  grace_expires_at timestamptz,
  will_renew boolean,
  verified_at timestamptz,
  sync_revision bigint not null default 0 check (sync_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, environment, entitlement_key),
  constraint billing_finite_dates check (
    (expires_at is null or isfinite(expires_at))
    and (grace_expires_at is null or isfinite(grace_expires_at))
    and (verified_at is null or isfinite(verified_at))
  ),
  constraint billing_active_subscription check (
    not active or (product_id is not null and store is not null and expires_at is not null)
  )
);

alter table public.billing_entitlements enable row level security;
revoke all on public.billing_entitlements from public, anon, authenticated;
grant select, insert, update, delete on public.billing_entitlements to service_role;

create function public.invalidate_billing_entitlements(
  p_user_ids uuid[], p_environment text, p_entitlement_key text
)
returns setof public.billing_entitlements
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if p_user_ids is null or cardinality(p_user_ids) > 100
    or p_environment is null or p_environment not in ('sandbox', 'production')
    or p_entitlement_key is distinct from 'arcel_pro' then
    raise sqlstate 'PT400' using message = 'invalid billing invalidation';
  end if;

  -- Sorting gives concurrent multi-account transfers the same row lock order.
  -- Unknown/deleted accounts are ignored; notifications cannot create profiles.
  return query
    insert into public.billing_entitlements as current (
      user_id, environment, entitlement_key, sync_revision
    )
    select p.id, p_environment, p_entitlement_key, 1
    from public.profiles p
    where p.id = any(p_user_ids)
    order by p.id
    on conflict (user_id, environment, entitlement_key) do update
      set verified_at = null,
          sync_revision = current.sync_revision + 1,
          updated_at = clock_timestamp()
    returning current.*;
end;
$$;

create function public.commit_billing_entitlement(
  p_user_id uuid, p_environment text, p_entitlement_key text,
  p_expected_revision bigint, p_snapshot jsonb
)
returns setof public.billing_entitlements
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if p_user_id is null or p_environment is null
    or p_environment not in ('sandbox', 'production')
    or p_entitlement_key is distinct from 'arcel_pro'
    or p_expected_revision is null or p_expected_revision < 1
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'active') is distinct from 'boolean' then
    raise sqlstate 'PT400' using message = 'invalid billing snapshot';
  end if;

  -- A claim can commit once. A newer invalidation fences out earlier HTTP work.
  -- No locks remain held while the application calls RevenueCat.
  return query
    update public.billing_entitlements as current
    set product_id = p_snapshot ->> 'product_id',
        store = p_snapshot ->> 'store',
        period_type = p_snapshot ->> 'period_type',
        active = (p_snapshot ->> 'active')::boolean,
        expires_at = (p_snapshot ->> 'expires_at')::timestamptz,
        grace_expires_at = (p_snapshot ->> 'grace_expires_at')::timestamptz,
        will_renew = (p_snapshot ->> 'will_renew')::boolean,
        verified_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where current.user_id = p_user_id
      and current.environment = p_environment
      and current.entitlement_key = p_entitlement_key
      and current.sync_revision = p_expected_revision
      and current.verified_at is null
    returning current.*;
end;
$$;

revoke all on function public.invalidate_billing_entitlements(uuid[], text, text)
  from public, anon, authenticated;
revoke all on function public.commit_billing_entitlement(uuid, text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.invalidate_billing_entitlements(uuid[], text, text)
  to service_role;
grant execute on function public.commit_billing_entitlement(uuid, text, text, bigint, jsonb)
  to service_role;
