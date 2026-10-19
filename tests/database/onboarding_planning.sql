\set ON_ERROR_STOP on
begin;
insert into auth.users values
  ('10101010-1010-4010-8010-101010101010', 'first-plan@example.invalid'),
  ('20202020-2020-4020-8020-202020202020', 'legacy-plan@example.invalid'),
  ('30303030-3030-4030-8030-303030303030', 'custom-plan@example.invalid'),
  ('40404040-4040-4040-8040-404040404040', 'rollback-plan@example.invalid'),
  ('50505050-5050-4050-8050-505050505050', 'missing-plan@example.invalid');
set local role service_role;
insert into public.onboarding_responses(user_id, answers) values
  ('10101010-1010-4010-8010-101010101010', '{"goal":"strength","days":["Monday","Thursday"]}'),
  ('30303030-3030-4030-8030-303030303030', '{"goal":"running"}'),
  ('40404040-4040-4040-8040-404040404040', '{"goal":"strength"}');
insert into public.onboarding_responses(user_id, answers, completed_at)
values('20202020-2020-4020-8020-202020202020', '{"goal":"soccer"}', '2026-01-01 12:00Z');
do $$
declare u uuid := '10101010-1010-4010-8010-101010101010';
  r jsonb; again jsonb; schedule public.planning_schedules; first_at timestamptz;
begin
  first_at := clock_timestamp();
  r := public.complete_onboarding(u);
  select * into strict schedule from public.planning_schedules where user_id = u;
  if r->>'user_id' <> u::text or (r->>'completed_at')::timestamptz < first_at
    or r->'answers' <> '{"goal":"strength","days":["Monday","Thursday"]}'::jsonb
    or schedule.horizon_days <> 21 or schedule.refresh_interval_days <> 7
    or schedule.horizon_end is not null or schedule.next_refresh_at < first_at
    or schedule.next_refresh_at > clock_timestamp() then
    raise exception 'completion did not preserve answers and enable initial three-week planning';
  end if;
  if exists(select 1 from public.replan_jobs where user_id = u) then
    raise exception 'completion should leave durable job discovery to the dispatcher';
  end if;
  again := public.complete_onboarding(u);
  if again->>'completed_at' <> r->>'completed_at' or again->'answers' <> r->'answers'
    or (select to_jsonb(s) from public.planning_schedules s where user_id = u) <> to_jsonb(schedule) then
    raise exception 'repeated completion changed the first completion or existing schedule';
  end if;
  if public.enqueue_due_replans() <> 1 or public.enqueue_due_replans() <> 0 then
    raise exception 'first plan was not discovered exactly once';
  end if;
  if not exists(select 1 from public.replan_jobs where user_id = u and kind = 'refresh' and status = 'pending') then
    raise exception 'completion did not produce a dispatchable initial refresh';
  end if;
  -- A previously completed account can initialize planning without resetting its completion date.
  r := public.complete_onboarding('20202020-2020-4020-8020-202020202020');
  if (r->>'completed_at')::timestamptz <> '2026-01-01 12:00Z'::timestamptz
    or r->'answers' <> '{"goal":"soccer"}'::jsonb
    or not exists(select 1 from public.planning_schedules where user_id = '20202020-2020-4020-8020-202020202020') then
    raise exception 'legacy completion could not initialize planning idempotently';
  end if;
  -- First completion may invalidate existing inputs, but must preserve configured settings.
  u := '30303030-3030-4030-8030-303030303030';
  perform public.configure_planning_schedule(u, clock_timestamp() + interval '14 days', 28, 14);
  update public.planning_schedules set horizon_end = current_date + 27 where user_id = u;
  select * into schedule from public.planning_schedules where user_id = u;
  perform public.complete_onboarding(u);
  if (select (s.next_refresh_at, s.horizon_end, s.horizon_days, s.refresh_interval_days)
    is distinct from (schedule.next_refresh_at, schedule.horizon_end, schedule.horizon_days, schedule.refresh_interval_days)
    from public.planning_schedules s where user_id = u)
    or (select revision from public.planning_schedules where user_id = u) <> schedule.revision + 1 then
    raise exception 'completion reset existing settings or bypassed input invalidation';
  end if;
  select * into schedule from public.planning_schedules where user_id = u;
  perform public.complete_onboarding(u);
  if (select to_jsonb(s) from public.planning_schedules s where user_id = u) <> to_jsonb(schedule) then
    raise exception 'repeated completion mutated a custom schedule';
  end if;
  if public.complete_onboarding('50505050-5050-4050-8050-505050505050') is not null
    or exists(select 1 from public.planning_schedules where user_id = '50505050-5050-4050-8050-505050505050')
    or public.complete_onboarding(gen_random_uuid()) is not null then
    raise exception 'missing onboarding created a schedule or returned a non-null response';
  end if;
end;
$$;

-- Force schedule creation to fail and verify the completion update rolls back with it.
reset role;
alter table public.planning_schedules add constraint test_reject_schedule
check (user_id <> '40404040-4040-4040-8040-404040404040'::uuid);
set local role service_role;
do $$
declare blocked boolean := false;
begin
  begin perform public.complete_onboarding('40404040-4040-4040-8040-404040404040');
  exception when check_violation then blocked := true; end;
  if not blocked
    or (select completed_at from public.onboarding_responses where user_id = '40404040-4040-4040-8040-404040404040') is not null
    or exists(select 1 from public.planning_schedules where user_id = '40404040-4040-4040-8040-404040404040') then
    raise exception 'completion and first-plan scheduling did not roll back atomically';
  end if;
end;
$$;
reset role;
alter table public.planning_schedules drop constraint test_reject_schedule;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10101010-1010-4010-8010-101010101010', true);
do $$
declare blocked boolean := false;
begin
  begin perform public.complete_onboarding('10101010-1010-4010-8010-101010101010');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked or has_function_privilege('anon', 'public.complete_onboarding(uuid)', 'execute') then
    raise exception 'completion RPC exposed to unauthenticated or direct client invocation';
  end if;
end;
$$;
rollback;
