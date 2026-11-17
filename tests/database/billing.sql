\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email) values
  ('11111111-1111-4111-8111-111111111111', 'billing-one@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'billing-two@example.invalid');
select public.configure_planning_schedule('11111111-1111-4111-8111-111111111111', now());

set local role anon;
do $$
begin
  begin
    perform 1 from public.billing_entitlements;
    raise exception 'anonymous billing reads allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.invalidate_billing_entitlements('{}', 'sandbox', 'arcel_pro');
    raise exception 'anonymous billing rpc allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
begin
  begin
    insert into public.billing_entitlements(user_id, environment, entitlement_key)
      values (auth.uid(), 'sandbox', 'arcel_pro');
    raise exception 'client billing insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.invalidate_billing_entitlements(array[auth.uid()], 'sandbox', 'arcel_pro');
    raise exception 'client billing invalidation allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.commit_billing_entitlement(auth.uid(), 'sandbox', 'arcel_pro', 1, '{"active":true}');
    raise exception 'client billing commit allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

set local role service_role;
do $$
declare
  first_user uuid := '11111111-1111-4111-8111-111111111111';
  second_user uuid := '22222222-2222-4222-8222-222222222222';
  claim public.billing_entitlements;
  snapshot jsonb := jsonb_build_object(
    'active', true, 'product_id', 'monthly', 'store', 'test_store',
    'period_type', 'normal', 'expires_at', now() + interval '1 month',
    'grace_expires_at', null, 'will_renew', true
  );
  planning_revision bigint;
  rows_changed bigint;
begin
  select revision into planning_revision from public.planning_schedules where user_id = first_user;
  select * into claim from public.invalidate_billing_entitlements(array[first_user], 'sandbox', 'arcel_pro');
  if claim.sync_revision <> 1 or claim.verified_at is not null or claim.active then
    raise exception 'new billing claim is not unverified';
  end if;
  perform public.commit_billing_entitlement(first_user, 'sandbox', 'arcel_pro', claim.sync_revision, snapshot);
  if not (select active and verified_at is not null from public.billing_entitlements where user_id = first_user) then
    raise exception 'verified access did not commit';
  end if;

  select count(*) into rows_changed from public.commit_billing_entitlement(first_user, 'sandbox', 'arcel_pro', 1, '{"active":false}');
  if rows_changed <> 0 then raise exception 'completed claim was replayed'; end if;

  perform public.invalidate_billing_entitlements(array[first_user], 'sandbox', 'arcel_pro');
  perform public.invalidate_billing_entitlements(array[first_user], 'sandbox', 'arcel_pro');
  select count(*) into rows_changed from public.commit_billing_entitlement(first_user, 'sandbox', 'arcel_pro', 2, snapshot);
  if rows_changed <> 0 then raise exception 'older verification overwrote newer claim'; end if;
  perform public.commit_billing_entitlement(first_user, 'sandbox', 'arcel_pro', 3, snapshot);

  -- A transfer invalidates both accounts in one call, even with duplicate IDs.
  select count(*) into rows_changed from public.invalidate_billing_entitlements(
    array[second_user, first_user, first_user, '33333333-3333-4333-8333-333333333333'::uuid],
    'sandbox', 'arcel_pro'
  );
  if rows_changed <> 2 or exists(select 1 from public.billing_entitlements where verified_at is not null) then
    raise exception 'transfer did not invalidate exactly the existing accounts';
  end if;
  if (select count(*) from public.profiles where id = '33333333-3333-4333-8333-333333333333') <> 0 then
    raise exception 'invalidation created a profile';
  end if;

  perform public.invalidate_billing_entitlements(array[first_user], 'production', 'arcel_pro');
  perform public.commit_billing_entitlement(first_user, 'production', 'arcel_pro', 1, '{"active":false}');
  perform public.commit_billing_entitlement(first_user, 'sandbox', 'arcel_pro', 4, snapshot);
  if (select active from public.billing_entitlements where user_id = first_user and environment = 'production') then
    raise exception 'sandbox access contaminated production';
  end if;
  if (select revision from public.planning_schedules where user_id = first_user) <> planning_revision then
    raise exception 'billing changed the training revision';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.billing_entitlements'::regclass) then
    raise exception 'billing rls is disabled';
  end if;
end;
$$;

reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if exists(select 1 from public.billing_entitlements where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'account deletion left billing rows';
  end if;
end;
$$;
rollback;
