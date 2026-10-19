\set ON_ERROR_STOP on
begin;
insert into auth.users values('77777777-7777-4777-8777-777777777777', 'delivery@example.invalid');
set local role service_role;
do $$
declare u uuid := '77777777-7777-4777-8777-777777777777';
  j public.replan_jobs; second_job public.replan_jobs; token uuid; c jsonb; recovered jsonb; n integer;
begin
  perform public.configure_planning_schedule(u, date_trunc('day', clock_timestamp()));
  if public.enqueue_due_replans() <> 1 or public.enqueue_due_replans() <> 0 then
    raise exception 'due discovery is not idempotent';
  end if;
  select * into j from public.replan_jobs where user_id = u;
  if j.delivery_token is null then raise exception 'delivery token not committed with job'; end if;
  select count(*) into n from public.list_replan_deliveries(20) where id = j.id;
  if n <> 1 then raise exception 'unsubmitted job not discoverable'; end if;
  if public.claim_replan_delivery(gen_random_uuid(), gen_random_uuid())->>'status' <> 'missing'
    or public.claim_replan_delivery(j.id, gen_random_uuid())->>'status' <> 'obsolete' then
    raise exception 'missing/stale deliveries not rejected';
  end if;
  c := public.claim_replan_delivery(j.id, j.delivery_token);
  if c->>'status' <> 'claimed' then raise exception 'exact claim failed'; end if;
  if public.claim_replan_delivery(j.id, j.delivery_token)->>'status' <> 'busy' then
    raise exception 'duplicate delivery acquired active lease';
  end if;
  perform public.mark_replan_dispatched(j.id, j.delivery_token);
  update public.replan_jobs set dispatched_at = now() - interval '11 minutes' where id = j.id;
  if public.recover_replan_delivery(j.id, j.delivery_token) is not null then
    raise exception 'recovery replaced active lease';
  end if;
  perform public.complete_replan_job(j.id, (c->'claim'->'job'->>'lease_token')::uuid, '{}', '[]');
  if public.claim_replan_delivery(j.id, j.delivery_token)->>'status' <> 'terminal' then
    raise exception 'completed job was claimed again';
  end if;
  j := public.enqueue_adjustment(u, 'first', 'first adjustment', current_date, current_date);
  second_job := public.enqueue_adjustment(u, 'second', 'second adjustment', current_date, current_date);
  update public.replan_jobs set available_at = clock_timestamp() - interval '2 seconds' where id = j.id;
  if public.claim_replan_delivery(second_job.id, second_job.delivery_token)->>'status' <> 'busy' then
    raise exception 'out-of-order task claimed another job';
  end if;
  c := public.claim_replan_delivery(j.id, j.delivery_token);
  update public.replan_jobs set lease_expires_at = now() - interval '1 second' where id = j.id;
  c := public.claim_replan_delivery(j.id, j.delivery_token);
  if (c->'claim'->'job'->>'attempts')::integer <> 2 then raise exception 'expired lease not reclaimed'; end if;
  perform public.fail_replan_job(j.id, (c->'claim'->'job'->>'lease_token')::uuid, 'temporary');
  if public.claim_replan_delivery(j.id, j.delivery_token)->>'status' <> 'not_ready' then
    raise exception 'database backoff ignored';
  end if;
  perform public.cancel_replan_job(u, second_job.id);
  perform public.cancel_replan_job(u, j.id);
  token := j.delivery_token;
  j := public.retry_replan_job(u, j.id);
  if j.delivery_token = token or j.dispatched_at is not null or j.dispatch_recoveries <> 0 then
    raise exception 'explicit retry did not reset delivery';
  end if;
  if public.claim_replan_delivery(j.id, token)->>'status' <> 'obsolete' then
    raise exception 'prior generation survived explicit retry';
  end if;
  perform public.mark_replan_dispatched(j.id, token);
  select * into j from public.replan_jobs where id = j.id;
  if j.dispatched_at is not null then raise exception 'stale confirmation changed new generation'; end if;
  perform public.mark_replan_dispatched(j.id, j.delivery_token);
  if exists(select 1 from public.list_replan_deliveries() where id = j.id) then
    raise exception 'fresh submission reconciled too early';
  end if;
  update public.replan_jobs set dispatched_at = now() - interval '11 minutes' where id = j.id;
  recovered := public.recover_replan_delivery(j.id, j.delivery_token);
  if recovered->>'delivery_token' = j.delivery_token::text or (recovered->>'dispatch_recoveries')::integer <> 1 then
    raise exception 'missing task recovery failed';
  end if;
  if public.recover_replan_delivery(j.id, j.delivery_token) is not null then
    raise exception 'concurrent recovery rotated token twice';
  end if;
  j := jsonb_populate_record(null::public.replan_jobs, recovered);
  perform public.mark_replan_dispatched(j.id, j.delivery_token);
  update public.replan_jobs set dispatched_at = now() - interval '11 minutes' where id = j.id;
  recovered := public.recover_replan_delivery(j.id, j.delivery_token);
  if recovered->>'status' <> 'failed' then raise exception 'transport recovery was unbounded'; end if;
  j := public.retry_replan_job(u, j.id);
  if j.dispatch_recoveries <> 0 then raise exception 'operator retry retained exhausted recovery budget'; end if;
  update public.replan_jobs set attempts = 5 where id = j.id;
  if public.claim_replan_delivery(j.id, j.delivery_token)->>'status' <> 'terminal' then
    raise exception 'generation attempt limit ignored';
  end if;
  if has_function_privilege('authenticated', 'public.claim_replan_delivery(uuid,uuid,integer)', 'execute')
    or has_function_privilege('anon', 'public.list_replan_deliveries(integer)', 'execute') then
    raise exception 'delivery functions exposed to clients';
  end if;
end;
$$;
rollback;
