\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
  ('71717171-7171-4171-8171-717171717171', 'event-paid@example.invalid'),
  ('72727272-7272-4272-8272-727272727272', 'event-onboarding@example.invalid');
set local role service_role;
insert into public.onboarding_responses(user_id, answers, completed_at)
values('71717171-7171-4171-8171-717171717171', '{}', now());
do $$
declare u uuid := '71717171-7171-4171-8171-717171717171';
  j public.replan_jobs; s public.planning_schedules; c jsonb; w uuid; newer uuid; token uuid; accepted boolean;
  paid jsonb := jsonb_build_object('active', true, 'product_id', 'monthly', 'store', 'test_store',
    'period_type', 'normal', 'expires_at', now() + interval '1 month');
begin
  perform public.configure_planning_schedule(u, now());
  perform public.enqueue_due_replans();
  select * into strict j from public.replan_jobs where user_id = u;
  perform public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 1, '{"active":false}');
  perform public.request_planning_billing_recheck(array[u]);
  select billing_wake_token into w from public.planning_schedules where user_id = u;
  accepted := public.defer_planning_for_billing(u, 'subscription_required', null, 'sandbox', 1, w);
  if not accepted or not exists(select 1 from public.planning_schedules where user_id = u
    and billing_pause_reason = 'subscription_required' and billing_recheck_at is null and billing_wake_token is null)
    or exists(select 1 from public.list_planning_billing_work()) then
    raise exception 'confirmed unpaid account was not dormant';
  end if;
  if public.enqueue_due_replans() <> 0 or exists(select 1 from public.list_replan_deliveries()) then
    raise exception 'dormant work leaked into normal discovery';
  end if;
  if (select attempts from public.replan_jobs where id = j.id) <> 0
    or not exists(select 1 from public.list_replan_deliveries(20, true) where id = j.id) then
    raise exception 'waiting consumed attempts or disabled mode lost the delivery';
  end if;
  -- Accepted verification itself commits a wake, with no request callback needed.
  perform public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 2, paid);
  select * into s from public.planning_schedules where user_id = u;
  w := s.billing_wake_token;
  if w is null or not exists(select 1 from public.list_planning_billing_work() x where x.user_id = u and x.wake_token = w) then
    raise exception 'accepted paid commit did not durably wake paused planning';
  end if;
  -- A late negative response cannot undo the payment or retire its fresh delivery.
  select delivery_token into token from public.replan_jobs where id = j.id;
  if public.defer_planning_for_billing(u, 'subscription_required', null, 'sandbox', 1, w) then
    raise exception 'old unpaid proof was accepted';
  end if;
  if (select to_jsonb(s2) from public.planning_schedules s2 where user_id = u) <> to_jsonb(s)
    or (select delivery_token from public.replan_jobs where id = j.id) <> token then
    raise exception 'rejected unpaid proof mutated the schedule, wake, or delivery';
  end if;
  -- A newer event survives old acknowledgement; a successful current ack is final.
  perform public.request_planning_billing_recheck(array[u]);
  select billing_wake_token into newer from public.planning_schedules where user_id = u;
  if newer = w then raise exception 'explicit wake reused its token'; end if;
  perform public.resume_planning_after_billing(u, 'sandbox', 2, w);
  if not exists(select 1 from public.planning_schedules where user_id = u
    and billing_wake_token = newer and billing_recheck_at <= clock_timestamp()) then
    raise exception 'old resume consumed or delayed a newer event';
  end if;
  perform public.resume_planning_after_billing(u, 'sandbox', 2, newer);
  if exists(select 1 from public.list_planning_billing_work())
    or (select count(*) from public.replan_jobs where user_id = u) <> 1 then
    raise exception 'current resume did not acknowledge once or duplicated initial work';
  end if;
  if public.defer_planning_for_billing(u, 'subscription_required', null, 'sandbox', 1) then
    raise exception 'late negative response put a resumed account back to sleep';
  end if;
  -- Temporary failures retry on a timer; delivery deferral never acknowledges an event.
  perform public.request_planning_billing_recheck(array[u]);
  select billing_wake_token into w from public.planning_schedules where user_id = u;
  perform public.defer_planning_for_billing(u, 'billing_unavailable', 60);
  if (select billing_wake_token from public.planning_schedules where user_id = u) <> w then
    raise exception 'delivery deferral acknowledged an event';
  end if;
  perform public.defer_planning_for_billing(u, 'billing_unavailable', 60, null, null, w);
  if not exists(select 1 from public.planning_schedules where user_id = u
    and billing_wake_token is null and billing_recheck_at > clock_timestamp()) then
    raise exception 'unavailable verification lost its timed retry';
  end if;
  update public.planning_schedules set billing_recheck_at = now() - interval '1 second' where user_id = u;
  if not exists(select 1 from public.list_planning_billing_work() x where x.user_id = u and x.wake_token is null) then
    raise exception 'due verification failure was not selected';
  end if;
  perform public.resume_planning_after_billing(u, 'sandbox', 2);
  select * into j from public.replan_jobs where id = j.id;
  c := public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 2);
  perform public.complete_replan_job(j.id, (c->'claim'->'job'->>'lease_token')::uuid, '{}', '[]');
  select * into s from public.planning_schedules where user_id = u;
  perform public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 3, paid);
  if (select to_jsonb(s2) from public.planning_schedules s2 where user_id = u) <> to_jsonb(s) then
    raise exception 'healthy paid verification wrote planning state';
  end if;
  -- A stale billing commit cannot write a wake even when planning needs one.
  update public.planning_schedules set billing_pause_reason = 'subscription_required' where user_id = u;
  perform public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  perform public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 4, paid);
  if (select billing_wake_token from public.planning_schedules where user_id = u) is not null then
    raise exception 'stale paid commit created a wake';
  end if;
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 5, paid);
  if (select billing_wake_token from public.planning_schedules where user_id = u) is null then
    raise exception 'current paid commit failed to create a wake';
  end if;
  -- Fully elapsed historical periods are definitively inactive even when their
  -- old period label is unknown. Potentially active unknown labels stay retryable.
  update public.billing_entitlements set period_type = 'historical', expires_at = now() - interval '1 day',
    grace_expires_at = now() + interval '1 day' where user_id = u;
  if public.defer_planning_for_billing(u, 'subscription_required', null, 'sandbox', 5) then
    raise exception 'unknown potentially active period became dormant';
  end if;
  update public.billing_entitlements set grace_expires_at = now() - interval '1 hour' where user_id = u;
  accepted := public.defer_planning_for_billing(u, 'subscription_required', null, 'sandbox', 5);
  if not accepted then raise exception 'fully elapsed historical period could not become dormant'; end if;
end;
$$;

-- Payment before setup does not need a schedule; onboarding later commits its own wake.
do $$
declare u uuid := '72727272-7272-4272-8272-727272727272'; w uuid;
begin
  perform public.invalidate_billing_entitlements(array[u], 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 1,
    '{"active":true,"product_id":"monthly","store":"test_store","period_type":"normal","expires_at":"2099-01-01T00:00:00Z"}');
  if exists(select 1 from public.planning_schedules where user_id = u) then
    raise exception 'payment created a schedule before onboarding';
  end if;
  insert into public.onboarding_responses(user_id, answers) values(u, '{}');
  perform public.complete_onboarding(u);
  select billing_wake_token into w from public.planning_schedules where user_id = u;
  perform public.complete_onboarding(u);
  if w is null or (select billing_wake_token from public.planning_schedules where user_id = u) <> w then
    raise exception 'onboarding lost its wake or repeated completion replaced it';
  end if;
end;
$$;
reset role;

-- A large dormant backlog does not occupy either work lane. Explicit events
-- and outage retries each get half a full batch, then borrow unused capacity.
insert into auth.users(id, email)
select md5('event-fairness-' || i)::uuid, 'fairness@example.invalid' from generate_series(1, 240) i;
set local role service_role;
insert into public.onboarding_responses(user_id, answers, completed_at)
select md5('event-fairness-' || i)::uuid, '{}', now() from generate_series(1, 240) i;
insert into public.planning_schedules(user_id, next_refresh_at, billing_pause_reason)
select md5('event-fairness-' || i)::uuid, now(), 'subscription_required' from generate_series(1, 240) i;
update public.planning_schedules set billing_wake_token = null, billing_recheck_at = null
where user_id in ('71717171-7171-4171-8171-717171717171', '72727272-7272-4272-8272-727272727272');
update public.planning_schedules set billing_wake_token = gen_random_uuid(), billing_recheck_at = now()
where user_id in (select md5('event-fairness-' || i)::uuid from generate_series(1, 20) i);
update public.planning_schedules set billing_pause_reason = 'billing_unavailable', billing_recheck_at = now() - interval '1 day'
where user_id in (select md5('event-fairness-' || i)::uuid from generate_series(21, 40) i);
do $$
declare n integer; wakes integer;
begin
  select count(*), count(wake_token) into n, wakes from public.list_planning_billing_work(20);
  if n <> 20 or wakes <> 10 then raise exception 'event/outage work did not split the full batch equally'; end if;
  select count(*), count(wake_token) into n, wakes from public.list_planning_billing_work(3);
  if n <> 3 or wakes <> 2 then raise exception 'odd batch did not favor explicit events'; end if;
  update public.planning_schedules set billing_pause_reason = 'subscription_required', billing_recheck_at = null
  where billing_wake_token is null;
  select count(*), count(wake_token) into n, wakes from public.list_planning_billing_work(20);
  if n <> 20 or wakes <> 20 then raise exception 'unused outage capacity was not available to events'; end if;
end;
$$;
set local role authenticated;
do $$
begin
  begin perform public.list_planning_billing_work();
    raise exception 'client called private work selection';
  exception when insufficient_privilege then null; end;
  begin perform public.defer_planning_for_billing(auth.uid(), 'billing_unavailable', 60);
    raise exception 'client changed billing wait state';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
