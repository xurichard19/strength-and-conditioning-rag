\set ON_ERROR_STOP on
begin;
insert into auth.users values
  ('88888888-8888-4888-8888-888888888888', 'refresh@example.invalid'),
  ('99999999-9999-4999-8999-999999999999', 'unscheduled@example.invalid');
set local role service_role;
do $$
declare u uuid := '88888888-8888-4888-8888-888888888888';
  j public.replan_jobs; c jsonb; r jsonb; initial_id uuid; payload jsonb;
  before_count integer; before_revision bigint; blocked boolean;
begin
  perform public.configure_planning_schedule(u, date_trunc('day', clock_timestamp()));
  if (select horizon_days <> 21 or refresh_interval_days <> 7 from public.planning_schedules where user_id = u) then
    raise exception 'default coverage is not three weeks with weekly refreshes';
  end if;
  perform public.enqueue_due_replans();
  c := public.claim_replan_job();
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  if j.claimed_on <> current_date or (c->>'effective_from')::date <> current_date
    or (c->>'effective_through')::date <> current_date + 20 then
    raise exception 'initial fill does not cover exactly 21 claim-local dates';
  end if;
  payload := jsonb_build_array(jsonb_build_object('scheduled_date', current_date,
    'name', 'preserved overlap', 'exercises', jsonb_build_array(jsonb_build_object('name', 'squat',
      'sets', jsonb_build_array(jsonb_build_object('planned_reps', 5, 'planned_rpe', 7))))));
  r := public.complete_replan_job(j.id, j.lease_token, '{}', payload);
  initial_id := (r->'workout_ids'->>0)::uuid;
  -- Two weeks remain from the previous cycle; add only its uncovered third week.
  update public.planning_schedules set horizon_end = current_date + 13,
    next_refresh_at = date_trunc('day', clock_timestamp()) - interval '7 days' where user_id = u;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for)
  values(u, 'refresh', 'weekly extension', 'test:extension', date_trunc('day', clock_timestamp()) - interval '7 days')
  returning * into j;
  c := public.claim_replan_delivery(j.id, j.delivery_token)->'claim';
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  if (c->>'effective_from')::date <> current_date + 14
    or (c->>'effective_through')::date <> current_date + 20 then
    raise exception 'weekly refresh overwrites overlap or does not append seven dates';
  end if;
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, array[initial_id], '[]');
  exception when sqlstate 'PT400' then blocked := true; end;
  if not blocked then raise exception 'refresh removed an existing workout'; end if;
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, '{}', payload);
  exception when sqlstate 'PT400' then blocked := true; end;
  if not blocked then raise exception 'refresh inserted into existing coverage'; end if;
  r := public.complete_replan_job(j.id, j.lease_token, '{}',
    jsonb_set(payload, '{0,scheduled_date}', to_jsonb(current_date + 14)));
  if not exists(select 1 from public.workouts where id = initial_id and superseded_at is null)
    or (select horizon_end <> current_date + 20
      or next_refresh_at <> j.scheduled_for + interval '7 days' from public.planning_schedules where user_id = u) then
    raise exception 'weekly extension altered overlap or moved the cadence anchor';
  end if;
  -- Already covered occurrences still complete and advance cadence without empty history.
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for)
  values(u, 'refresh', 'covered occurrence', 'test:covered', date_trunc('day', clock_timestamp()) - interval '14 days')
  returning * into j;
  c := public.claim_replan_delivery(j.id, j.delivery_token)->'claim';
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  select count(*) into before_count from public.planning_changes where user_id = u;
  if (c->>'effective_from')::date <= (c->>'effective_through')::date then
    raise exception 'covered refresh should have an empty generation window';
  end if;
  r := public.complete_replan_job(j.id, j.lease_token, '{}', '[]');
  if r->>'change_id' is not null or (select count(*) from public.planning_changes where user_id = u) <> before_count
    or (select next_refresh_at from public.planning_schedules where user_id = u) <> j.scheduled_for + interval '7 days' then
    raise exception 'covered occurrence did not finish without history or advance cadence';
  end if;
  if public.complete_replan_job(j.id, j.lease_token, '{}', '[]') <> r then
    raise exception 'covered occurrence publication is not idempotent';
  end if;
  -- Delayed jobs restore a full horizon from claim day, not an obsolete scheduled date.
  update public.planning_schedules set horizon_end = current_date - 5 where user_id = u;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for)
  values(u, 'refresh', 'late delivery', 'test:late', date_trunc('day', clock_timestamp()) - interval '30 days')
  returning * into j;
  c := public.claim_replan_delivery(j.id, j.delivery_token)->'claim';
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  if (c->>'effective_from')::date <> current_date or (c->>'horizon_end')::date <> current_date + 20 then
    raise exception 'late delivery failed to restore 21 dates';
  end if;
  -- Simulate local midnight while a worker still owns its lease.
  update public.replan_jobs set claimed_on = current_date - 1 where id = j.id;
  select revision into before_revision from public.planning_schedules where user_id = u;
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, '{}', '[]');
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked or (select revision from public.planning_schedules where user_id = u) <> before_revision then
    raise exception 'midnight publication was accepted or partially committed';
  end if;
  update public.replan_jobs set lease_expires_at = clock_timestamp() - interval '1 second' where id = j.id;
  c := public.claim_replan_delivery(j.id, j.delivery_token)->'claim';
  if (c->'job'->>'claimed_on')::date <> current_date
    or (c->'job'->>'lease_token')::uuid = j.lease_token then
    raise exception 'reclaim did not freeze a new local date and fence the old worker';
  end if;
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  perform public.complete_replan_job(j.id, j.lease_token, '{}', '[]');
  if (select horizon_end from public.planning_schedules where user_id = u) <> current_date + 20 then
    raise exception 'reclaimed refresh did not publish expected coverage';
  end if;
end;
$$;

-- Trigger execution is privileged; the sport operation still obeys caller ownership/RLS.
set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
insert into public.sports_workouts(id, user_id, sport, scheduled_date)
values('88888888-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888', 'soccer', current_date + 5);
do $$
declare blocked boolean := false;
begin
  begin insert into public.sports_workouts(user_id, sport, scheduled_date)
    values('99999999-9999-4999-8999-999999999999', 'soccer', current_date);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'sport trigger bypassed caller ownership'; end if;
end;
$$;
set local role service_role;
do $$
declare u uuid := '88888888-8888-4888-8888-888888888888';
  sport_id uuid := '88888888-0000-4000-8000-000000000001';
  j public.replan_jobs; n integer; rev bigint; c jsonb; blocked boolean;
begin
  select * into strict j from public.replan_jobs where user_id = u and deduplication_key like 'sport:%';
  if j.effective_from <> current_date + 2 or j.effective_through <> current_date + 8 then
    raise exception 'sport insert did not enqueue a bounded recovery window';
  end if;
  c := public.claim_replan_delivery(j.id, j.delivery_token)->'claim';
  select revision into rev from public.planning_schedules where user_id = u;
  update public.sports_workouts set sport = sport, updated_at = clock_timestamp() where id = sport_id;
  if (select count(*) from public.replan_jobs where user_id = u and deduplication_key like 'sport:%') <> 1
    or (select revision from public.planning_schedules where user_id = u) <> rev then
    raise exception 'no-op sport update enqueued work or invalidated a proposal';
  end if;
  update public.sports_workouts set status = 'completed', completed_at = clock_timestamp() where id = sport_id;
  if (select count(*) from public.replan_jobs where user_id = u and deduplication_key like 'sport:%') <> 1
    or (select revision from public.planning_schedules where user_id = u) <> rev + 1 then
    raise exception 'sport results should invalidate reads without launching an automatic adjustment';
  end if;
  blocked := false;
  begin perform public.complete_replan_job(j.id, (c->'job'->>'lease_token')::uuid, '{}', '[]');
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'sport result allowed stale proposal publication'; end if;
  perform public.cancel_replan_job(u, j.id);
  update public.sports_workouts set scheduled_date = current_date + 10 where id = sport_id;
  select * into j from public.replan_jobs where user_id = u and status = 'pending' order by created_at desc, id limit 1;
  if j.effective_from <> current_date + 2 or j.effective_through <> current_date + 13 then
    raise exception 'sport move omitted its old or new recovery neighborhood';
  end if;
  select count(*) into n from public.replan_jobs where user_id = u;
  update public.sports_workouts set status = 'cancelled', cancelled_at = clock_timestamp() where id = sport_id;
  update public.sports_workouts set status = 'planned', cancelled_at = null where id = sport_id;
  delete from public.sports_workouts where id = sport_id;
  if (select count(*) from public.replan_jobs where user_id = u) <> n + 3 then
    raise exception 'cancel, reinstate, or delete did not enqueue';
  end if;
  -- Out-of-coverage changes still invalidate context, but cannot schedule irrelevant generation.
  select count(*) into n from public.replan_jobs where user_id = u;
  select revision into rev from public.planning_schedules where user_id = u;
  insert into public.sports_workouts(id, user_id, sport, scheduled_date)
  values(sport_id, u, 'soccer', current_date + 90);
  update public.sports_workouts set scheduled_date = current_date - 90 where id = sport_id;
  if (select count(*) from public.replan_jobs where user_id = u) <> n
    or (select revision from public.planning_schedules where user_id = u) <> rev + 2 then
    raise exception 'irrelevant sport dates enqueued work or failed to invalidate inputs';
  end if;
  update public.sports_workouts set scheduled_date = current_date + 21 where id = sport_id;
  if not exists(select 1 from public.replan_jobs where user_id = u and effective_from = current_date + 18
    and effective_through = current_date + 20) then
    raise exception 'sport just beyond horizon did not adjust covered recovery dates';
  end if;
  insert into public.sports_workouts(user_id, sport, scheduled_date)
  values('99999999-9999-4999-8999-999999999999', 'soccer', current_date);
  if exists(select 1 from public.planning_schedules where user_id = '99999999-9999-4999-8999-999999999999')
    or exists(select 1 from public.replan_jobs where user_id = '99999999-9999-4999-8999-999999999999') then
    raise exception 'sport write implicitly enabled planning';
  end if;
  blocked := false;
  begin update public.sports_workouts set user_id = '99999999-9999-4999-8999-999999999999' where id = sport_id;
  exception when sqlstate 'PT400' then blocked := true; end;
  if not blocked then raise exception 'sport owner transfer bypassed schedule invalidation'; end if;
  if has_function_privilege('authenticated', 'public.replan_after_sport_change()', 'execute') then
    raise exception 'sport trigger function exposed for direct client invocation';
  end if;
end;
$$;
reset role;
delete from auth.users where id in ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999');
do $$
begin
  if exists(select 1 from public.replan_jobs where user_id in
    ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999')) then
    raise exception 'account deletion left or re-enqueued planning work';
  end if;
end;
$$;
rollback;
