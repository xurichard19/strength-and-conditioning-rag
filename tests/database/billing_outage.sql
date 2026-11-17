\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email) values
  ('81818181-8181-4181-8181-818181818181', 'outage-paid@example.invalid'),
  ('82828282-8282-4282-8282-828282828282', 'outage-unpaid@example.invalid');

-- Neither client role can create a verification claim or report its failure.
do $$
declare client_role text;
begin
  foreach client_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(client_role, 'public.claim_billing_verification(uuid,text,text)', 'EXECUTE')
      or has_function_privilege(client_role, 'public.defer_billing_verification(uuid,text,text,bigint)', 'EXECUTE')
      or has_column_privilege(client_role, 'public.billing_entitlements', 'outage_access_until', 'SELECT')
      or has_column_privilege(client_role, 'public.billing_entitlements', 'verification_retry_at', 'UPDATE') then
      raise exception 'client role % has backend-only outage privileges', client_role;
    end if;
  end loop;
end;
$$;

set local role service_role;
insert into public.onboarding_responses(user_id, answers, completed_at)
values ('81818181-8181-4181-8181-818181818181', '{}', now());

do $$
declare
  u uuid := '81818181-8181-4181-8181-818181818181';
  unpaid uuid := '82828282-8282-4282-8282-828282828282';
  missing_user uuid := '83838383-8383-4383-8383-838383838383';
  entitlement public.billing_entitlements;
  deferred public.billing_entitlements;
  job public.replan_jobs;
  deadline timestamptz;
  expiry timestamptz;
  before_defer timestamptz;
  revision bigint;
  rows_changed bigint;
  snapshot jsonb;
  denied_snapshot jsonb;
begin
  perform public.configure_planning_schedule(u, now());
  perform public.enqueue_due_replans();
  select * into strict job from public.replan_jobs where user_id = u;

  if exists(select 1 from public.claim_billing_verification(missing_user, 'sandbox', 'arcel_pro'))
    or exists(select 1 from public.profiles where id = missing_user) then
    raise exception 'verification claim created an account';
  end if;

  select * into strict entitlement from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
  if entitlement.sync_revision <> 1 or entitlement.verified_at is not null
    or entitlement.outage_access_until is not null or entitlement.verification_retry_at is not null then
    raise exception 'new projection granted outage access';
  end if;
  expiry := clock_timestamp() + interval '1 month';
  snapshot := jsonb_build_object('active', true, 'product_id', 'monthly', 'store', 'test_store',
    'period_type', 'normal', 'expires_at', expiry);
  select * into strict entitlement from public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 1, snapshot);
  deadline := entitlement.outage_access_until;
  if deadline is distinct from entitlement.verified_at + interval '24 hours'
    or entitlement.verification_retry_at is not null
    or public.planning_billing_status(u, 'sandbox', 1) <> 'allowed' then
    raise exception 'successful paid verification did not establish bounded access';
  end if;
  if exists(select 1 from public.defer_billing_verification(u, 'sandbox', 'arcel_pro', 1)) then
    raise exception 'failure overwrote a completed verification';
  end if;

  -- Routine refresh and provider failure preserve, but never extend, the allowance.
  select * into strict entitlement from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
  if entitlement.sync_revision <> 2 or entitlement.verified_at is not null
    or entitlement.outage_access_until is distinct from deadline then
    raise exception 'routine claim discarded or extended paid allowance';
  end if;
  before_defer := clock_timestamp();
  select * into strict deferred from public.defer_billing_verification(u, 'sandbox', 'arcel_pro', 2);
  if deferred.verification_retry_at < before_defer + interval '60 seconds'
    or deferred.verification_retry_at > clock_timestamp() + interval '60 seconds'
    or deferred.outage_access_until is distinct from deadline
    or deferred.sync_revision <> 2 or deferred.verified_at is not null then
    raise exception 'failure did not preserve the deadline with a 60-second cooldown';
  end if;
  if exists(select 1 from public.defer_billing_verification(u, 'sandbox', 'arcel_pro', 2))
    or (select to_jsonb(e) from public.billing_entitlements e where user_id = u) <> to_jsonb(deferred) then
    raise exception 'duplicate failure extended its cooldown or mutated the projection';
  end if;

  -- Interactive fallback must never authorize a new automatic generation attempt.
  if public.planning_billing_status(u, 'sandbox', 2) <> 'billing_unavailable'
    or public.claim_replan_delivery(job.id, job.delivery_token, 300, 'sandbox', 2)->>'status'
      <> 'billing_unavailable'
    or (select attempts from public.replan_jobs where id = job.id) <> 0 then
    raise exception 'outage allowance authorized automatic planning or consumed an attempt';
  end if;
  select * into strict entitlement from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
  if entitlement.sync_revision <> 3 or entitlement.verification_retry_at is not null
    or entitlement.outage_access_until is distinct from deadline then
    raise exception 'retry claim failed to clear cooldown while preserving the fixed deadline';
  end if;
  if exists(select 1 from public.defer_billing_verification(u, 'sandbox', 'arcel_pro', 2)) then
    raise exception 'older failure was accepted after a newer claim';
  end if;

  -- A webhook fences both a delayed success and a delayed transient failure.
  perform public.defer_billing_verification(u, 'sandbox', 'arcel_pro', 3);
  select * into strict entitlement from public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  if entitlement.sync_revision <> 4 or entitlement.verified_at is not null
    or entitlement.outage_access_until is not null or entitlement.verification_retry_at is not null then
    raise exception 'webhook retained an outage allowance or retry marker';
  end if;
  if exists(select 1 from public.defer_billing_verification(u, 'sandbox', 'arcel_pro', 3))
    or exists(select 1 from public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 3, snapshot)) then
    raise exception 'stale verification response survived webhook invalidation';
  end if;
  select * into strict entitlement from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
  select * into strict deferred from public.defer_billing_verification(u, 'sandbox', 'arcel_pro', entitlement.sync_revision);
  if deferred.outage_access_until is not null then
    raise exception 'routine retry restored a webhook-cleared allowance';
  end if;

  -- A fresh paid response restores access and the durable wake for paused planning.
  perform public.defer_planning_for_billing(u, 'billing_unavailable', 60);
  select * into strict entitlement from public.commit_billing_entitlement(
    u, 'sandbox', 'arcel_pro', entitlement.sync_revision, snapshot);
  if entitlement.outage_access_until is null or entitlement.verification_retry_at is not null
    or public.planning_billing_status(u, 'sandbox', entitlement.sync_revision) <> 'allowed'
    or not exists(select 1 from public.planning_schedules where user_id = u
      and billing_wake_token is not null and billing_recheck_at <= clock_timestamp()) then
    raise exception 'successful re-verification did not restore paid access and wake planning';
  end if;

  -- Shorter paid periods, including paid intro periods, are capped at actual expiry.
  expiry := clock_timestamp() + interval '2 hours';
  snapshot := snapshot || jsonb_build_object('period_type', 'intro', 'expires_at', expiry);
  select sync_revision into revision from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
  select * into strict entitlement from public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', revision, snapshot);
  if entitlement.outage_access_until is distinct from expiry then
    raise exception 'outage allowance exceeded the known paid expiry';
  end if;

  -- A negative or ineligible response always removes the previous paid allowance.
  for denied_snapshot in select value from jsonb_array_elements(jsonb_build_array(
    snapshot || '{"active":false}'::jsonb,
    snapshot || '{"period_type":"trial"}'::jsonb,
    snapshot || jsonb_build_object('period_type', 'normal', 'expires_at', clock_timestamp() - interval '1 second',
      'grace_expires_at', clock_timestamp() + interval '1 day'),
    snapshot || jsonb_build_object('expires_at', clock_timestamp()),
    snapshot || '{"active":false,"expires_at":null}'::jsonb
  )) loop
    select sync_revision into revision from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
    perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', revision, snapshot);
    select sync_revision into revision from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
    perform public.defer_billing_verification(u, 'sandbox', 'arcel_pro', revision);
    select * into strict entitlement from public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', revision, denied_snapshot);
    if entitlement.outage_access_until is not null or entitlement.verification_retry_at is not null then
      raise exception 'ineligible verification retained outage access: %', denied_snapshot;
    end if;
  end loop;

  -- First-time unpaid accounts and the other environment never inherit paid allowance.
  select sync_revision into revision from public.claim_billing_verification(unpaid, 'sandbox', 'arcel_pro');
  select * into strict deferred from public.defer_billing_verification(unpaid, 'sandbox', 'arcel_pro', revision);
  if deferred.outage_access_until is not null then raise exception 'unpaid account received outage access'; end if;
  select sync_revision into revision from public.claim_billing_verification(u, 'production', 'arcel_pro');
  select * into strict deferred from public.defer_billing_verification(u, 'production', 'arcel_pro', revision);
  if deferred.outage_access_until is not null then raise exception 'sandbox allowance leaked into production'; end if;

  -- Transfers clear both accounts; neither stale success nor failure can restore them.
  perform public.commit_billing_entitlement(unpaid, 'sandbox', 'arcel_pro', 1, snapshot);
  select sync_revision into revision from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', revision, snapshot);
  select count(*) into rows_changed from public.invalidate_billing_entitlements(array[unpaid, u], 'sandbox', 'arcel_pro');
  if rows_changed <> 2 or exists(select 1 from public.billing_entitlements where environment = 'sandbox'
    and (outage_access_until is not null or verification_retry_at is not null or verified_at is not null)) then
    raise exception 'transfer retained an allowance for either account';
  end if;

  begin
    select sync_revision into revision from public.claim_billing_verification(u, 'sandbox', 'arcel_pro');
    perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', revision, snapshot || '{"expires_at":null}'::jsonb);
    raise exception 'active subscription without a known expiry was accepted';
  exception when check_violation then null; end;
  begin
    update public.billing_entitlements set outage_access_until = 'infinity' where user_id = u;
    raise exception 'infinite outage deadline was accepted';
  exception when check_violation then null; end;
  begin
    update public.billing_entitlements set verification_retry_at = '-infinity' where user_id = u;
    raise exception 'infinite retry timestamp was accepted';
  exception when check_violation then null; end;
end;
$$;
rollback;
