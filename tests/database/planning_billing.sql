\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
  ('61616161-6161-4161-8161-616161616161', 'planning-paid@example.invalid'),
  ('62626262-6262-4262-8262-626262626262', 'planning-waiting@example.invalid'),
  ('63636363-6363-4363-8363-636363636363', 'planning-incomplete@example.invalid');
set local role service_role;
insert into public.onboarding_responses(user_id, answers, completed_at) values
  ('61616161-6161-4161-8161-616161616161', '{}', now()),
  ('62626262-6262-4262-8262-626262626262', '{}', now());
do $$
declare u uuid := '61616161-6161-4161-8161-616161616161';
  waiting uuid := '62626262-6262-4262-8262-626262626262';
  incomplete uuid := '63636363-6363-4363-8363-636363636363';
  j public.replan_jobs; manual public.replan_jobs; c jsonb; old_token uuid; old_revision bigint; resumed boolean;
  snapshot jsonb := jsonb_build_object('active', true, 'product_id', 'monthly', 'store', 'test_store',
    'period_type', 'normal', 'expires_at', now() + interval '1 month', 'will_renew', false);
begin
  perform public.configure_planning_schedule(u, now() - interval '14 days');
  perform public.configure_planning_schedule(waiting, now());
  perform public.configure_planning_schedule(incomplete, now());
  if public.resume_planning(u, 'sandbox', 1) then raise exception 'missing entitlement resumed'; end if;
  perform public.invalidate_billing_entitlements(array[u, incomplete], 'sandbox', 'arcel_pro');
  perform public.commit_billing_entitlement(u, 'sandbox', 'arcel_pro', 1, snapshot);
  perform public.commit_billing_entitlement(incomplete, 'sandbox', 'arcel_pro', 1, snapshot);
  if public.resume_planning(incomplete, 'sandbox', 1)
    or exists(select 1 from public.replan_jobs where user_id = incomplete) then
    raise exception 'payment skipped onboarding';
  end if;
  resumed := public.resume_planning(u, 'sandbox', 1);
  resumed := public.resume_planning(u, 'sandbox', 1) and resumed;
  if not resumed or (select count(*) from public.replan_jobs where user_id = u) <> 1 then
    raise exception 'resumption did not create exactly one initial plan';
  end if;
  select * into strict j from public.replan_jobs where user_id = u;
  if public.claim_replan_delivery(j.id, j.delivery_token, 300, 'production', 1)->>'status' <> 'billing_unavailable'
    or public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 2)->>'status' <> 'billing_unavailable' then
    raise exception 'wrong environment or stale revision authorized';
  end if;
  update public.billing_entitlements set verified_at = now() - interval '6 minutes' where user_id = u;
  if public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 1)->>'status' <> 'billing_unavailable' then
    raise exception 'stale cache authorized';
  end if;
  update public.billing_entitlements set verified_at = now(), period_type = 'trial' where user_id = u;
  if public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 1)->>'status' <> 'billing_required' then
    raise exception 'trial authorized';
  end if;
  update public.billing_entitlements set period_type = 'normal', expires_at = now() - interval '1 second',
    grace_expires_at = now() + interval '3 days' where user_id = u;
  if public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 1)->>'status' <> 'billing_required'
    or (select attempts from public.replan_jobs where id = j.id) <> 0 then
    raise exception 'expiry/grace authorized or waiting consumed attempts';
  end if;
  select revision into old_revision from public.planning_schedules where user_id = u;
  old_token := j.delivery_token;
  perform public.mark_replan_dispatched(j.id, old_token);
  perform public.defer_planning(u, 'subscription_required', 300);
  select * into strict j from public.replan_jobs where id = j.id;
  if j.delivery_token = old_token or j.dispatched_at is not null or j.dispatch_recoveries <> 0
    or j.attempts <> 0 or j.status <> 'pending'
    or (select revision from public.planning_schedules where user_id = u) <> old_revision
    or exists(select 1 from public.list_replan_deliveries() where id = j.id)
    or not exists(select 1 from public.list_replan_deliveries(20, true) where id = j.id)
    or public.claim_replan_delivery(j.id, old_token)->>'status' <> 'obsolete' then
    raise exception 'defer failed to retire only delivery state';
  end if;
  -- Paused candidates do not occupy the ready page; completed unpaid schedules
  -- with no job remain discoverable, while incomplete onboarding is excluded.
  if not exists(select 1 from public.list_planning_billing_rechecks(1) x where x = waiting) then
    raise exception 'initial no-job schedule was not fairly discoverable';
  end if;
  perform public.defer_planning(waiting, 'billing_unavailable', 30);
  if exists(select 1 from public.list_planning_billing_rechecks()) then
    raise exception 'future rechecks or incomplete onboarding were selected';
  end if;
  perform public.request_planning_billing_recheck(array[u]);
  if not exists(select 1 from public.list_planning_billing_rechecks(1) x where x = u) then
    raise exception 'invalidation failed to wake paused account';
  end if;
  update public.billing_entitlements set expires_at = now() + interval '1 month' where user_id = u;
  if not public.resume_planning(u, 'sandbox', 1) then raise exception 'paid cancellation lost remaining access'; end if;
  c := public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 1);
  if c->>'status' <> 'claimed' or (c->'claim'->'job'->>'attempts')::integer <> 1
    or (c->'claim'->>'effective_from')::date <> current_date then
    raise exception 'paid delayed first plan did not use current dates';
  end if;
  -- Expiry after authorization does not cancel the live attempt or its publication.
  update public.billing_entitlements set expires_at = now() - interval '1 second' where user_id = u;
  perform public.defer_planning(u, 'subscription_required', 300);
  if not exists(select 1 from public.replan_jobs where id = j.id and status = 'running'
    and lease_token = (c->'claim'->'job'->>'lease_token')::uuid and attempts = 1) then
    raise exception 'defer cancelled a live authorized attempt';
  end if;
  perform public.complete_replan_job(j.id, (c->'claim'->'job'->>'lease_token')::uuid, '{}', '[]');
  if (select status from public.replan_jobs where id = j.id) <> 'succeeded' then
    raise exception 'authorized attempt could not finish after expiry';
  end if;
  -- Consolidate accumulated automatic inputs, preserving explicit manual requests.
  perform public.enqueue_adjustment(u, 'sport:billing-one', 'sport one', current_date, current_date + 1);
  perform public.enqueue_adjustment(u, 'onboarding:billing-two', 'survey', current_date + 2, current_date + 3);
  manual := public.enqueue_adjustment(u, 'manual:billing', 'keep my request', current_date, current_date + 4);
  update public.billing_entitlements set expires_at = now() + interval '1 month' where user_id = u;
  perform public.resume_planning(u, 'sandbox', 1);
  if (select count(*) from public.replan_jobs where user_id = u and kind = 'adjustment' and status = 'pending') <> 2
    or not exists(select 1 from public.replan_jobs where id = manual.id and reason = 'keep my request'
      and effective_through = manual.effective_through and status = 'pending')
    or not exists(select 1 from public.replan_jobs where user_id = u and status = 'pending'
      and reason = 'training inputs changed' and effective_from = current_date and effective_through = current_date + 3) then
    raise exception 'resume lost automatic coverage or changed manual request';
  end if;
  -- Billing-disabled operation remains usable for existing users without onboarding.
  if not public.resume_planning(incomplete) then raise exception 'disabled billing changed legacy behavior'; end if;
  select * into strict j from public.replan_jobs where user_id = incomplete;
  if public.claim_replan_delivery(j.id, j.delivery_token, 300, 'sandbox', 1)->>'status' <> 'onboarding_required'
    or public.claim_replan_delivery(j.id, j.delivery_token)->>'status' <> 'claimed' then
    raise exception 'onboarding requirement did not follow enforcement mode';
  end if;
  update public.replan_jobs set lease_expires_at = now() - interval '1 second' where id = j.id;
  perform public.defer_planning(incomplete, 'billing_unavailable', 30);
  if not exists(select 1 from public.replan_jobs where id = j.id and status = 'pending'
    and attempts = 1 and lease_token is null and delivery_token <> j.delivery_token) then
    raise exception 'expired attempt was not deferred without consuming another attempt';
  end if;
end;
$$;

-- An exhausted first plan remains visible across cadence boundaries and cleanup,
-- and only an explicit retry grants it a new attempt budget.
do $$
declare u uuid := '62626262-6262-4262-8262-626262626262'; j public.replan_jobs; c jsonb;
begin
  perform public.resume_planning(u);
  select * into strict j from public.replan_jobs where user_id = u;
  update public.replan_jobs set status = 'failed', attempts = 5, error = 'generation failed',
    scheduled_for = now() - interval '40 days', completed_at = now() - interval '40 days' where id = j.id;
  update public.planning_schedules set next_refresh_at = now() - interval '7 days' where user_id = u;
  perform public.resume_planning(u);
  perform public.enqueue_due_replans();
  perform public.purge_replan_jobs(now() - interval '30 days');
  if not exists(select 1 from public.replan_jobs where id = j.id and status = 'failed' and attempts = 5)
    or (select count(*) from public.replan_jobs where user_id = u) <> 1 then
    raise exception 'failed first plan was purged or silently restarted';
  end if;
  j := public.retry_replan_job(u, j.id);
  c := public.claim_replan_delivery(j.id, j.delivery_token);
  if c->>'status' <> 'claimed' or (c->'claim'->'job'->>'attempts')::integer <> 1 then
    raise exception 'explicit delayed initial retry failed';
  end if;
end;
$$;
set local role authenticated;
do $$
begin
  begin perform public.resume_planning('61616161-6161-4161-8161-616161616161');
    raise exception 'client supplied an unfenced billing bypass';
  exception when insufficient_privilege then null; end;
  begin perform public.claim_replan_delivery(gen_random_uuid(), gen_random_uuid(), 300, 'sandbox', 1);
    raise exception 'client supplied a billing proof';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
