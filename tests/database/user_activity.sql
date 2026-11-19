\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
  ('81818181-8181-4181-8181-818181818181', 'activity@example.invalid'),
  ('82828282-8282-4282-8282-828282828282', 'activity-setup@example.invalid'),
  ('83838383-8383-4383-8383-838383838383', 'activity-fresh@example.invalid');
set local role service_role;
insert into public.onboarding_responses(user_id, answers, completed_at)
values ('81818181-8181-4181-8181-818181818181', '{}', now());

do $$
declare u uuid := '81818181-8181-4181-8181-818181818181';
  setup uuid := '82828282-8282-4282-8282-828282828282';
  fresh uuid := '83838383-8383-4383-8383-838383838383';
  result jsonb; repeated jsonb; old_revision bigint; old_activity timestamptz;
  job_id uuid; token uuid;
begin
  if (select last_active_at from public.profiles where id = u) < transaction_timestamp()
    or not public.planning_activity_allowed(u) then
    raise exception 'new profile did not receive an activity grace baseline';
  end if;
  if public.record_user_activity('84848484-8484-4484-8484-848484848484') is not null then
    raise exception 'missing profile was silently recreated';
  end if;
  begin perform public.record_user_activity(null);
    raise exception 'null user accepted';
  exception when sqlstate 'PT400' then null; end;

  result := public.record_user_activity(setup);
  if result->'refresh_job' <> 'null'::jsonb
    or exists(select 1 from public.planning_schedules where user_id = setup) then
    raise exception 'activity initialized an incomplete account';
  end if;
  perform public.configure_planning_schedule(setup, now());
  perform public.record_user_activity(setup);
  if exists(select 1 from public.replan_jobs where user_id = setup) then
    raise exception 'activity bypassed onboarding';
  end if;

  perform public.configure_planning_schedule(u, now() - interval '90 days');
  select revision into old_revision from public.planning_schedules where user_id = u;
  update public.profiles set last_active_at = now() - interval '30 days' where id = u;
  result := public.record_user_activity(u);
  job_id := (result->'refresh_job'->>'id')::uuid;
  repeated := public.record_user_activity(u);
  if job_id is null or (repeated->'refresh_job'->>'id')::uuid <> job_id
    or result->>'last_active_at' <> repeated->>'last_active_at'
    or (select count(*) from public.replan_jobs where user_id = u) <> 1
    or (select revision from public.planning_schedules where user_id = u) <> old_revision
    or (result->>'last_active_at')::timestamptz < statement_timestamp() then
    raise exception 'return failed to refresh activity and reuse exactly one job without invalidating inputs';
  end if;
  select last_active_at into old_activity from public.profiles where id = u;
  update public.profiles set last_active_at = old_activity - interval '5 hours' where id = u;
  if (public.record_user_activity(u)->>'last_active_at')::timestamptz <> old_activity - interval '5 hours' then
    raise exception 'recent activity caused another write';
  end if;
  update public.profiles set last_active_at = now() - interval '7 hours' where id = u;
  if (public.record_user_activity(u)->>'last_active_at')::timestamptz < statement_timestamp() then
    raise exception 'activity older than throttle was not renewed';
  end if;

  -- Returning cannot reset an exhausted first plan's retry budget.
  update public.replan_jobs set status = 'failed', attempts = 5, completed_at = now() where id = job_id;
  result := public.record_user_activity(u);
  if result->'refresh_job' <> 'null'::jsonb
    or (select count(*) from public.replan_jobs where user_id = u) <> 1
    or (select attempts from public.replan_jobs where id = job_id) <> 5 then
    raise exception 'return silently retried an exhausted initial plan';
  end if;

  update public.planning_schedules set billing_pause_reason = 'subscription_required',
    billing_wake_token = null where user_id = u;
  perform public.record_user_activity(u);
  select billing_wake_token into token from public.planning_schedules where user_id = u;
  perform public.record_user_activity(u);
  if token is null or (select billing_wake_token from public.planning_schedules where user_id = u) <> token
    or (select billing_pause_reason from public.planning_schedules where user_id = u) <> 'subscription_required' then
    raise exception 'return erased billing pause or replaced durable wake intent';
  end if;

  insert into public.onboarding_responses(user_id, answers, completed_at) values (fresh, '{}', now());
  perform public.configure_planning_schedule(fresh, now() + interval '1 day');
  if public.record_user_activity(fresh)->'refresh_job' <> 'null'::jsonb
    or exists(select 1 from public.replan_jobs where user_id = fresh) then
    raise exception 'fresh schedule generated unnecessarily';
  end if;
  if has_function_privilege('authenticated', 'public.record_user_activity(uuid)', 'execute')
    or has_function_privilege('anon', 'public.record_user_activity(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.planning_activity_allowed(uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.record_user_activity(uuid)', 'execute') then
    raise exception 'activity RPC privileges are not server-only';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '81818181-8181-4181-8181-818181818181';
do $$
begin
  update public.profiles set display_name = 'Activity owner' where id = auth.uid();
  if not found then raise exception 'owner profile update was broken'; end if;
  begin update public.profiles set last_active_at = now() + interval '1 year' where id = auth.uid();
    raise exception 'client forged activity';
  exception when insufficient_privilege then null; end;
  begin insert into public.profiles(id, last_active_at) select gen_random_uuid(), now() where false;
    raise exception 'client retained activity insert privilege';
  exception when insufficient_privilege then null; end;
  begin perform public.record_user_activity(auth.uid());
    raise exception 'client called privileged activity RPC';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
