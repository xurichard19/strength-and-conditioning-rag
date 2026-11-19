-- Run after the staged cutover, never against a real project.
begin;
insert into auth.users(id, email) values
  ('85858585-8585-4585-8585-858585858585', 'inactive@example.invalid'),
  ('86868686-8686-4686-8686-868686868686', 'active@example.invalid'),
  ('87878787-8787-4787-8787-878787878787', 'live@example.invalid');
set local role service_role;
insert into public.onboarding_responses(user_id, answers, completed_at)
select id, '{}', now() from public.profiles
where id in ('85858585-8585-4585-8585-858585858585',
  '86868686-8686-4686-8686-868686868686', '87878787-8787-4787-8787-878787878787');

do $$
declare dormant uuid := '85858585-8585-4585-8585-858585858585';
  active uuid := '86868686-8686-4686-8686-868686868686';
  live uuid := '87878787-8787-4787-8787-878787878787';
  j public.replan_jobs; manual public.replan_jobs; c jsonb; token uuid; rotated uuid; revision bigint;
begin
  update public.profiles set last_active_at = statement_timestamp() - interval '504 hours' where id = dormant;
  if public.planning_activity_allowed(dormant) then raise exception '21-day boundary remained eligible'; end if;
  update public.profiles set last_active_at = statement_timestamp() - interval '504 hours' + interval '1 second'
  where id = dormant;
  if not public.planning_activity_allowed(dormant) then raise exception 'activity inside 21 days was rejected'; end if;
  update public.profiles set last_active_at = now() - interval '30 days' where id = dormant;
  perform public.configure_planning_schedule(dormant, now() - interval '90 days');
  perform public.configure_planning_schedule(active, now());
  if public.enqueue_planning_refresh(dormant) <> 0 then
    raise exception 'direct enqueue bypassed inactivity';
  end if;
  if public.enqueue_due_replans(1, true) <> 1 then
    raise exception 'inactive overdue account occupied bounded discovery page';
  end if;
  if exists(select 1 from public.replan_jobs where user_id = dormant)
    or not exists(select 1 from public.replan_jobs where user_id = active) then
    raise exception 'inactive overdue account bypassed gate or occupied bounded discovery page';
  end if;
  update public.replan_jobs set status = 'succeeded', completed_at = now() where user_id = active;
  -- A verified payment resume (including billing-disabled proof) does not wake inactivity.
  if not public.resume_planning(dormant)
    or exists(select 1 from public.replan_jobs where user_id = dormant) then
    raise exception 'billing resume bypassed inactivity';
  end if;

  -- Simulate a task queued before the cutoff, with a partially spent retry budget.
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for, attempts, dispatched_at)
  values(dormant, 'refresh', 'delayed delivery', 'refresh:inactive-fixture', now() - interval '7 days', 2, now())
  returning * into j;
  token := j.delivery_token;
  select s.revision into revision from public.planning_schedules s where user_id = dormant;
  if exists(select 1 from public.list_replan_deliveries(20, true) where id = j.id)
    or exists(select 1 from public.list_replan_deliveries(20, false) where id = j.id)
    or public.claim_replan_job() is not null then
    raise exception 'inactive refresh was dispatched or claimed by legacy worker';
  end if;
  if public.claim_replan_delivery(j.id, token)->>'status' <> 'obsolete' then
    raise exception 'inactive delivery was not acknowledged through existing worker protocol';
  end if;
  select delivery_token into rotated from public.replan_jobs where id = j.id;
  if rotated = token or not exists(select 1 from public.replan_jobs where id = j.id
    and status = 'pending' and attempts = 2 and dispatched_at is null and lease_token is null)
    or (select s.revision from public.planning_schedules s where user_id = dormant) <> revision then
    raise exception 'inactive delivery consumed attempts or corrupted planning state';
  end if;
  perform public.claim_replan_delivery(j.id, token);
  if (select delivery_token from public.replan_jobs where id = j.id) <> rotated then
    raise exception 'duplicate old delivery rotated current token';
  end if;
  c := public.record_user_activity(dormant);
  if (c->'refresh_job'->>'id')::uuid <> j.id
    or (select count(*) from public.replan_jobs where user_id = dormant) <> 1
    or not exists(select 1 from public.list_replan_deliveries(20, true) where id = j.id) then
    raise exception 'return failed to reuse and expose held delivery';
  end if;
  c := public.claim_replan_delivery(j.id, rotated);
  if c->>'status' <> 'claimed' or (c->'claim'->'job'->>'attempts')::integer <> 3
    or (c->'claim'->>'effective_from')::date <> current_date then
    raise exception 'return did not claim preserved job from today with its original budget';
  end if;
  update public.replan_jobs set status = 'failed', completed_at = now(), lease_token = null,
    lease_expires_at = null where id = j.id;

  -- Inactive pending refreshes must not obstruct explicit adjustments for the user.
  update public.profiles set last_active_at = now() - interval '30 days' where id = dormant;
  update public.planning_schedules set horizon_end = current_date + 20 where user_id = dormant;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for, available_at)
  values(dormant, 'refresh', 'held refresh', 'refresh:held-second', now(), now() - interval '1 day') returning * into j;
  select * into manual from public.enqueue_adjustment(dormant, 'manual:inactive', 'explicit request', current_date, current_date);
  update public.replan_jobs set status = 'running', attempts = 1, expected_revision = 0,
    lease_token = gen_random_uuid(), lease_expires_at = now() - interval '1 second' where id = j.id;
  if not exists(select 1 from public.list_replan_deliveries() where id = manual.id)
    or public.claim_replan_delivery(manual.id, manual.delivery_token)->>'status' <> 'claimed' then
    raise exception 'held refresh blocked explicit adjustment';
  end if;
  update public.replan_jobs set status = 'failed', completed_at = now(), lease_token = null,
    lease_expires_at = null where id = manual.id;
  select * into manual from public.enqueue_adjustment(dormant, 'manual:inactive-legacy', 'explicit legacy request', current_date, current_date);
  update public.replan_jobs set status = 'running', expected_revision = 0,
    lease_token = gen_random_uuid(), lease_expires_at = now() - interval '1 second' where id = j.id;
  c := public.claim_replan_job();
  if (c->'job'->>'id')::uuid is distinct from manual.id then
    raise exception 'legacy worker failed to skip held refresh for explicit adjustment';
  end if;
  update public.replan_jobs set status = 'failed', completed_at = now(), lease_token = null,
    lease_expires_at = null where id = manual.id;

  -- Recurring planning billing work sleeps with refreshes; durable wakes survive.
  update public.planning_schedules set billing_pause_reason = 'billing_unavailable',
    billing_recheck_at = now() - interval '1 minute', billing_wake_token = null where user_id = dormant;
  if exists(select 1 from public.list_planning_billing_work() where user_id = dormant)
    or exists(select 1 from public.list_planning_billing_rechecks() x where x = dormant) then
    raise exception 'inactive refresh kept recurring billing polling alive';
  end if;
  perform public.request_planning_billing_recheck(array[dormant]);
  if exists(select 1 from public.list_planning_billing_work() where user_id = dormant) then
    raise exception 'billing event restarted absent user';
  end if;
  perform public.record_user_activity(dormant);
  if not exists(select 1 from public.list_planning_billing_work() where user_id = dormant)
    or (select billing_pause_reason from public.planning_schedules where user_id = dormant) <> 'billing_unavailable' then
    raise exception 'return lost durable billing reconciliation or bypassed permission';
  end if;
  update public.profiles set last_active_at = now() - interval '30 days' where id = dormant;
  select * into manual from public.enqueue_adjustment(dormant, 'manual:billing-inactive', 'explicit unpaid request', current_date, current_date);
  if not exists(select 1 from public.list_planning_billing_work() where user_id = dormant) then
    raise exception 'inactivity prevented billing reconciliation for explicit request';
  end if;

  -- A live refresh continues to serialize explicit work and may publish after expiry.
  perform public.configure_planning_schedule(live, now());
  update public.planning_schedules set horizon_end = current_date + 20 where user_id = live;
  perform public.enqueue_planning_refresh(live);
  select * into j from public.replan_jobs where user_id = live;
  update public.replan_jobs set available_at = now() - interval '1 minute' where id = j.id;
  select * into manual from public.enqueue_adjustment(live, 'manual:live-inactive', 'must wait', current_date, current_date);
  c := public.claim_replan_delivery(j.id, j.delivery_token);
  update public.profiles set last_active_at = now() - interval '30 days' where id = live;
  if public.claim_replan_delivery(j.id, j.delivery_token)->>'status' <> 'busy' then
    raise exception 'inactivity disturbed live refresh lease';
  end if;
  if public.claim_replan_delivery(manual.id, manual.delivery_token)->>'status' <> 'busy' then
    raise exception 'explicit adjustment bypassed inactive live refresh lease';
  end if;
  perform public.complete_replan_job(j.id, (c->'claim'->'job'->>'lease_token')::uuid, '{}', '[]');
  if (select status from public.replan_jobs where id = j.id) <> 'succeeded' then
    raise exception 'inactivity prevented authorized publication';
  end if;
end;
$$;
rollback;
