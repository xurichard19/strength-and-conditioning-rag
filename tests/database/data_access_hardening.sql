\set ON_ERROR_STOP on
begin;
insert into auth.users values
  ('11111111-1111-4111-8111-111111111111', 'hardening-one@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'hardening-two@example.invalid');
select public.configure_planning_schedule('11111111-1111-4111-8111-111111111111', date_trunc('day', now()) - interval '1 day');
select public.configure_planning_schedule('22222222-2222-4222-8222-222222222222', date_trunc('day', now()));

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare u uuid := auth.uid(); rev bigint; sport_id uuid; blocked boolean;
begin
  blocked := false;
  begin update public.profiles set timezone = 'invalid/test-zone' where id = u;
  exception when sqlstate 'PT400' then blocked := true; end;
  if not blocked then raise exception 'invalid timezone accepted'; end if;

  select revision into rev from public.planning_schedules where user_id = u;
  update public.profiles set display_name = 'new display name', timezone = 'UTC' where id = u;
  if (select revision from public.planning_schedules where user_id = u) <> rev then
    raise exception 'profile no-op/display name invalidated planning';
  end if;
  update public.profiles set timezone = 'America/New_York' where id = u;
  if (select revision from public.planning_schedules where user_id = u) <> rev + 1 then
    raise exception 'timezone edit did not invalidate exactly once';
  end if;
  update public.profiles set timezone = 'UTC' where id = u;

  select revision into rev from public.planning_schedules where user_id = u;
  insert into public.onboarding_responses(user_id, answers) values (u, '{"goal":"strength"}');
  if (select revision from public.planning_schedules where user_id = u) <> rev + 1 then
    raise exception 'onboarding insert did not invalidate exactly once';
  end if;
  insert into public.onboarding_responses(user_id, answers) values (u, '{"goal":"strength"}')
  on conflict(user_id) do update set answers = excluded.answers;
  if (select revision from public.planning_schedules where user_id = u) <> rev + 1 then
    raise exception 'identical onboarding upsert invalidated planning';
  end if;
  insert into public.onboarding_responses(user_id, answers) values (u, '{"goal":"hybrid"}')
  on conflict(user_id) do update set answers = excluded.answers;
  if (select revision from public.planning_schedules where user_id = u) <> rev + 2 then
    raise exception 'changed onboarding upsert did not invalidate exactly once';
  end if;

  select revision into rev from public.planning_schedules where user_id = u;
  insert into public.sports_workouts(user_id, sport, scheduled_date) values (u, 'soccer', current_date) returning id into sport_id;
  update public.sports_workouts set sport = 'soccer' where id = sport_id;
  if (select revision from public.planning_schedules where user_id = u) <> rev + 1 then
    raise exception 'identical sports patch invalidated planning';
  end if;
  update public.sports_workouts set notes = 'hard practice' where id = sport_id;
  delete from public.sports_workouts where id = sport_id;
  if (select revision from public.planning_schedules where user_id = u) <> rev + 3 then
    raise exception 'sports edit/delete failed to invalidate';
  end if;

  insert into public.messages(conversation_id, user_id, role, content) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', u, 'user', 'hello');
  blocked := false;
  begin insert into public.messages(conversation_id, user_id, role, content) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', u, 'assistant', 'forged');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'client can forge assistant message'; end if;
  blocked := false;
  begin update public.messages set role = 'assistant' where user_id = u;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'client can rewrite message authorship'; end if;
  blocked := false;
  begin insert into public.messages(conversation_id, user_id, role, content, created_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', u, 'user', 'spoofed time', now());
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'client can spoof message timestamps'; end if;
  blocked := false;
  begin insert into public.messages(conversation_id, user_id, role, content)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'user', 'wrong owner');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'client can write another user message'; end if;
  raise notice 'timezone, revision, and message owner checks passed';
end;
$$;

set local role service_role;
insert into public.messages(conversation_id, user_id, role, content) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'assistant', 'backend reply');
do $$
declare j public.replan_jobs; first_claim jsonb; second_claim jsonb; reclaimed jsonb; blocked boolean := false;
begin
  if public.enqueue_due_replans(1) <> 1 then raise exception 'first user not queued'; end if;
  select * into j from public.replan_jobs where user_id = '11111111-1111-4111-8111-111111111111';
  perform public.cancel_replan_job(j.user_id, j.id);
  if public.enqueue_due_replans(1) <> 1 then raise exception 'cancelled occurrence starved next user'; end if;
  if public.enqueue_due_replans(1) <> 0 then raise exception 'duplicate occurrence enqueued'; end if;
  if (select count(*) from public.replan_jobs) <> 2 then raise exception 'wrong job count'; end if;

  update public.replan_jobs set status = 'pending', completed_at = null where id = j.id;
  first_claim := public.claim_replan_job();
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, effective_from, effective_through)
  values ((first_claim->'job'->>'user_id')::uuid, 'adjustment', 'pending behind running', 'second', current_date, current_date);
  second_claim := public.claim_replan_job();
  if first_claim is null or second_claim is null
    or first_claim->'job'->>'user_id' = second_claim->'job'->>'user_id' then
    raise exception 'claim did not serialize per user';
  end if;
  if public.claim_replan_job() is not null then raise exception 'claimed alongside live user lease'; end if;
  update public.replan_jobs set lease_expires_at = clock_timestamp() - interval '1 second'
  where id = (first_claim->'job'->>'id')::uuid;
  reclaimed := public.claim_replan_job();
  if reclaimed is null or reclaimed->'job'->>'id' <> first_claim->'job'->>'id'
    or reclaimed->'job'->>'lease_token' = first_claim->'job'->>'lease_token' then
    raise exception 'expired lease not reclaimed with new token';
  end if;
  begin perform public.renew_replan_lease((first_claim->'job'->>'id')::uuid, (first_claim->'job'->>'lease_token')::uuid);
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'old lease token accepted'; end if;

  if public.latest_refresh_occurrence('2026-03-01 14:00Z', 7, 'America/New_York', '2026-03-08 14:00Z')
    <> '2026-03-08 13:00Z'::timestamptz then raise exception 'spring dst changed local cadence'; end if;
  if public.latest_refresh_occurrence('2026-10-25 13:00Z', 7, 'America/New_York', '2026-11-01 15:00Z')
    <> '2026-11-01 14:00Z'::timestamptz then raise exception 'fall dst changed local cadence'; end if;
  raise notice 'scheduler fairness, claiming, lease fencing, and dst checks passed';
end;
$$;
rollback;
