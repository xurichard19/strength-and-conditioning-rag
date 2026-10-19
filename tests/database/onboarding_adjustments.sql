\set ON_ERROR_STOP on
begin;
insert into auth.users values
  ('61616161-6161-4161-8161-616161616161', 'redo-active@example.invalid'),
  ('62626262-6262-4262-8262-626262626262', 'redo-unplanned@example.invalid'),
  ('63636363-6363-4363-8363-636363636363', 'redo-expired@example.invalid'),
  ('64646464-6464-4464-8464-646464646464', 'redo-draft@example.invalid');
set local role service_role;
do $$
declare u uuid := '61616161-6161-4161-8161-616161616161';
  c jsonb; r jsonb; j public.replan_jobs; schedule public.planning_schedules;
  v_today date; completed_id uuid; editable_id uuid; results_id uuid; results_set_id uuid; completed_at timestamptz;
  payload jsonb; rev bigint; blocked boolean;
begin
  -- Select a real timezone whose local date differs from the database's UTC date.
  update public.profiles set timezone = case
    when (clock_timestamp() at time zone 'Pacific/Kiritimati')::date <> current_date
      then 'Pacific/Kiritimati' else 'Pacific/Honolulu' end where id = u;
  select (clock_timestamp() at time zone timezone)::date into v_today from public.profiles where id = u;
  insert into public.onboarding_responses(user_id, answers) values(u, '{"goal":"strength"}');
  r := public.complete_onboarding(u);
  completed_at := (r->>'completed_at')::timestamptz;
  perform public.enqueue_due_replans();
  c := public.claim_replan_job();
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  payload := jsonb_build_array(jsonb_build_object('scheduled_date', v_today,
    'name', 'completed session', 'exercises', jsonb_build_array(jsonb_build_object('name', 'squat',
      'sets', jsonb_build_array(jsonb_build_object('planned_reps', 5))))));
  payload := payload || jsonb_set(jsonb_set(payload, '{0,scheduled_date}', to_jsonb(v_today + 1)),
    '{0,name}', '"editable session"');
  payload := payload || jsonb_build_array(jsonb_set(jsonb_set(payload->0, '{scheduled_date}', to_jsonb(v_today + 2)),
    '{name}', '"results session"'));
  perform public.complete_replan_job(j.id, j.lease_token, '{}', payload);
  select id into completed_id from public.workouts where user_id = u and scheduled_date = v_today;
  select id into editable_id from public.workouts where user_id = u and scheduled_date = v_today + 1;
  select id into results_id from public.workouts where user_id = u and scheduled_date = v_today + 2;
  select revision into rev from public.planning_schedules where user_id = u;
  perform public.record_workout_results(u, completed_id, rev, 'completed');
  select s.id into results_set_id from public.exercise_sets s join public.exercises e on e.id = s.exercise_id
  where e.workout_id = results_id;
  select revision into rev from public.planning_schedules where user_id = u;
  perform public.record_workout_results(u, results_id, rev, 'planned',
    jsonb_build_array(jsonb_build_object('id', results_set_id, 'actual_reps', 6)));
  select * into schedule from public.planning_schedules where user_id = u;

  update public.onboarding_responses set answers = '{"goal":"strength","equipment":"dumbbells"}' where user_id = u;
  select * into strict j from public.replan_jobs where user_id = u and deduplication_key like 'onboarding:%';
  if j.kind <> 'adjustment' or j.effective_from <> v_today or j.effective_through <> schedule.horizon_end
    or (select horizon_end from public.planning_schedules where user_id = u) <> schedule.horizon_end
    or (select next_refresh_at from public.planning_schedules where user_id = u) <> schedule.next_refresh_at
    or (select revision from public.planning_schedules where user_id = u) <> schedule.revision + 1 then
    raise exception 'redo did not queue exactly the remaining local-date coverage without shifting cadence';
  end if;
  -- The mobile finish flow retries its saved answers and completion separately.
  insert into public.onboarding_responses(user_id, answers)
  values(u, '{"equipment":"dumbbells","goal":"strength"}')
  on conflict(user_id) do update set answers = excluded.answers;
  r := public.complete_onboarding(u);
  if (r->>'completed_at')::timestamptz <> completed_at
    or (select count(*) from public.replan_jobs where user_id = u and deduplication_key like 'onboarding:%') <> 1
    or (select revision from public.planning_schedules where user_id = u) <> schedule.revision + 1 then
    raise exception 'identical save/completion replay duplicated work or changed completion metadata';
  end if;
  c := public.claim_replan_delivery(j.id, j.delivery_token)->'claim';
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, array[completed_id], '[]');
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'onboarding redo replaced performed training'; end if;
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, array[results_id], '[]');
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'onboarding redo replaced a session containing set results'; end if;
  payload := jsonb_build_array(jsonb_build_object('scheduled_date', v_today + 1,
    'name', 'dumbbell session', 'exercises', jsonb_build_array(jsonb_build_object('name', 'goblet squat',
      'sets', jsonb_build_array(jsonb_build_object('planned_reps', 8))))));
  perform public.complete_replan_job(j.id, j.lease_token, array[editable_id], payload);
  if not exists(select 1 from public.workouts where id = completed_id and status = 'completed' and superseded_at is null)
    or not exists(select 1 from public.workouts where id = results_id and superseded_at is null)
    or (select actual_reps from public.exercise_sets where id = results_set_id) <> 6
    or (select horizon_end from public.planning_schedules where user_id = u) <> schedule.horizon_end
    or (select next_refresh_at from public.planning_schedules where user_id = u) <> schedule.next_refresh_at then
    raise exception 'redo publication changed coverage/cadence or performed training';
  end if;

  -- Missing and expired coverage do not acquire a new horizon from an answer edit.
  insert into public.onboarding_responses(user_id, answers, completed_at) values
    ('62626262-6262-4262-8262-626262626262', '{}', clock_timestamp()),
    ('63636363-6363-4363-8363-636363636363', '{}', clock_timestamp());
  perform public.configure_planning_schedule('63636363-6363-4363-8363-636363636363', clock_timestamp() + interval '7 days');
  update public.planning_schedules set horizon_end = current_date - 1 where user_id = '63636363-6363-4363-8363-636363636363';
  select * into schedule from public.planning_schedules where user_id = '63636363-6363-4363-8363-636363636363';
  update public.onboarding_responses set answers = '{"goal":"conditioning"}'
  where user_id in ('62626262-6262-4262-8262-626262626262', '63636363-6363-4363-8363-636363636363');
  if exists(select 1 from public.replan_jobs where user_id in
      ('62626262-6262-4262-8262-626262626262', '63636363-6363-4363-8363-636363636363'))
    or exists(select 1 from public.planning_schedules where user_id = '62626262-6262-4262-8262-626262626262')
    or (select (horizon_end, next_refresh_at) is distinct from (schedule.horizon_end, schedule.next_refresh_at)
      from public.planning_schedules where user_id = '63636363-6363-4363-8363-636363636363') then
    raise exception 'answer edit created or extended absent/expired coverage';
  end if;
  -- A legacy user without any schedule can still request their first plan on completion.
  perform public.complete_onboarding('62626262-6262-4262-8262-626262626262');
  if not exists(select 1 from public.planning_schedules where user_id = '62626262-6262-4262-8262-626262626262'
      and horizon_end is null and horizon_days = 21 and refresh_interval_days = 7) then
    raise exception 'initial planning fallback was lost';
  end if;
  update public.onboarding_responses set answers = '{"goal":"strength"}' where user_id = '62626262-6262-4262-8262-626262626262';
  if exists(select 1 from public.replan_jobs where user_id = '62626262-6262-4262-8262-626262626262') then
    raise exception 'answer edit queued an adjustment before first coverage exists';
  end if;
  -- Draft saves never start redo generation, even if a schedule was configured explicitly.
  insert into public.onboarding_responses(user_id, answers) values('64646464-6464-4464-8464-646464646464', '{}');
  perform public.configure_planning_schedule('64646464-6464-4464-8464-646464646464', clock_timestamp() + interval '7 days');
  update public.planning_schedules set horizon_end = current_date + 20 where user_id = '64646464-6464-4464-8464-646464646464';
  update public.onboarding_responses set answers = '{"goal":"strength"}' where user_id = '64646464-6464-4464-8464-646464646464';
  if exists(select 1 from public.replan_jobs where user_id = '64646464-6464-4464-8464-646464646464') then
    raise exception 'draft answer changes queued redo work';
  end if;
end;
$$;

-- Force enqueue failure: answer changes and their revision must roll back with the job.
reset role;
alter table public.replan_jobs add constraint test_reject_onboarding_adjustment
check (deduplication_key not like 'onboarding:%') not valid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61616161-6161-4161-8161-616161616161', true);
do $$
declare rev bigint; prior_answers jsonb; blocked boolean := false;
begin
  select revision into rev from public.planning_schedules where user_id = auth.uid();
  select answers into prior_answers from public.onboarding_responses where user_id = auth.uid();
  begin update public.onboarding_responses set answers = '{"goal":"different"}' where user_id = auth.uid();
  exception when check_violation then blocked := true; end;
  if not blocked or (select answers from public.onboarding_responses where user_id = auth.uid()) <> prior_answers
    or (select revision from public.planning_schedules where user_id = auth.uid()) <> rev then
    raise exception 'failed enqueue left partially saved onboarding or revision';
  end if;
end;
$$;
reset role;
alter table public.replan_jobs drop constraint test_reject_onboarding_adjustment;
set local role authenticated;
update public.onboarding_responses set answers = '{"goal":"conditioning"}' where user_id = auth.uid();
do $$
begin
  if has_function_privilege('authenticated', 'public.replan_after_onboarding_change()', 'execute') then
    raise exception 'privileged onboarding trigger exposed to direct clients';
  end if;
end;
$$;
set local role service_role;
do $$
declare u uuid := '61616161-6161-4161-8161-616161616161';
  sport_id uuid := '65656565-6565-4565-8565-656565656565';
  v_today date; rev bigint; jobs integer; blocked boolean := false;
begin
  if (select count(*) from public.replan_jobs where user_id = u and deduplication_key like 'onboarding:%') <> 2 then
    raise exception 'authenticated answer save did not atomically enqueue its adjustment';
  end if;
  -- A stable sport id fences a repeated insert before its AFTER trigger can run again.
  select (clock_timestamp() at time zone timezone)::date into v_today from public.profiles where id = u;
  insert into public.sports_workouts(id, user_id, sport, scheduled_date) values(sport_id, u, 'soccer', v_today + 3);
  select revision into rev from public.planning_schedules where user_id = u;
  select count(*) into jobs from public.replan_jobs where user_id = u;
  begin insert into public.sports_workouts(id, user_id, sport, scheduled_date) values(sport_id, u, 'soccer', v_today + 3);
  exception when unique_violation then blocked := true; end;
  if not blocked or (select count(*) from public.replan_jobs where user_id = u) <> jobs
    or (select revision from public.planning_schedules where user_id = u) <> rev then
    raise exception 'duplicate sport id queued work or invalidated planning twice';
  end if;
end;
$$;
rollback;
