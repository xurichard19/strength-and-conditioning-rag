\set ON_ERROR_STOP on
begin;
insert into auth.users values('11111111-1111-4111-8111-111111111111', 'rpc-test@example.invalid');
set local role service_role;
do $$
declare u uuid := '11111111-1111-4111-8111-111111111111';
  j public.replan_jobs; c jsonb; r jsonb; old_ids uuid[]; ids uuid[];
  changes uuid[] := '{}'; rev bigint; due timestamptz; horizon date; n integer;
  payload jsonb; before_count integer; before_revision bigint; blocked boolean;
begin
  perform public.configure_planning_schedule(u, date_trunc('day', clock_timestamp()), 7, 7);
  if public.enqueue_due_replans() <> 1 or public.enqueue_due_replans() <> 0 then
    raise exception 'refresh deduplication failed';
  end if;
  c := public.claim_replan_job();
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  horizon := (c->>'horizon_end')::date;
  payload := jsonb_build_array(jsonb_build_object('scheduled_date', current_date,
    'name', 'original', 'exercises', jsonb_build_array(jsonb_build_object('name', 'squat',
      'sets', jsonb_build_array(jsonb_build_object('planned_reps', 5), jsonb_build_object('planned_reps', 8))))));
  r := public.complete_replan_job(j.id, j.lease_token, '{}'::uuid[], payload);
  changes := array_append(changes, (r->>'change_id')::uuid);
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(r->'workout_ids');
  if (select count(*) from public.exercise_sets) <> 2 then raise exception 'nested inserts failed'; end if;
  if public.complete_replan_job(j.id, j.lease_token, '{}'::uuid[], payload)->>'change_id' <> r->>'change_id' then
    raise exception 'publication retry failed';
  end if;
  select next_refresh_at into due from public.planning_schedules where user_id = u;
  -- Three overlapping adjustments followed by three undos and three redos.
  for n in 1..3 loop
    j := public.enqueue_adjustment(u, 'adjust:' || n, 'sleep', current_date, current_date);
    if (public.enqueue_adjustment(u, 'adjust:' || n, 'sleep', current_date, current_date)).id <> j.id then
      raise exception 'adjustment deduplication failed';
    end if;
    c := public.claim_replan_job();
    j := jsonb_populate_record(null::public.replan_jobs, c->'job');
    old_ids := ids;
    r := public.complete_replan_job(j.id, j.lease_token, old_ids,
      jsonb_set(payload, '{0,name}', to_jsonb('version ' || n)));
    changes := array_append(changes, (r->>'change_id')::uuid);
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(r->'workout_ids');
  end loop;
  select count(*) into before_count from public.workouts;
  for n in reverse 4..2 loop
    select revision into rev from public.planning_schedules where user_id = u;
    perform public.undo_planning_change(u, changes[n], rev);
  end loop;
  if (select name from public.workouts where superseded_at is null) <> 'original' then
    raise exception 'three undos did not restore original';
  end if;
  for n in 2..4 loop
    select revision into rev from public.planning_schedules where user_id = u;
    perform public.redo_planning_change(u, changes[n], rev);
  end loop;
  if (select count(*) from public.workouts) <> before_count then raise exception 'undo copied workouts'; end if;
  if (select count(*) from public.exercise_sets) <> before_count * 2 then raise exception 'undo copied sets'; end if;
  if (select next_refresh_at from public.planning_schedules where user_id = u) <> due
    or (select horizon_end from public.planning_schedules where user_id = u) <> horizon then
    raise exception 'adjustments or undo shifted cadence or horizon';
  end if;
  -- Reject out-of-order undo, with no revision change.
  select revision into rev from public.planning_schedules where user_id = u;
  blocked := false;
  begin perform public.undo_planning_change(u, changes[2], rev);
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'out of order undo accepted'; end if;
  -- New input invalidates the claimed proposal.
  j := public.enqueue_adjustment(u, 'stale', 'sleep', current_date, current_date);
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  insert into public.sports_workouts(user_id, sport, scheduled_date) values(u, 'soccer', current_date);
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, ids, payload);
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'stale proposal accepted'; end if;
  perform public.fail_replan_job(j.id, j.lease_token, 'stale', false);
  -- Window enforcement and atomic rollback on nested validation failure.
  j := public.enqueue_adjustment(u, 'bounds', 'sleep', current_date, current_date);
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, ids,
    jsonb_set(payload, '{0,scheduled_date}', to_jsonb(current_date + 1)));
  exception when sqlstate 'PT400' then blocked := true; end;
  if not blocked then raise exception 'outside window accepted'; end if;
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, ids,
    jsonb_set(payload, '{0,exercises,0,sets,0,planned_reps}', '-1'::jsonb));
  exception when check_violation then blocked := true; end;
  if not blocked or (select count(*) from public.workouts) <> before_count
    or (select count(*) from public.workouts where superseded_at is null) <> 1 then
    raise exception 'failed publication was not atomic';
  end if;
  -- Expired lease reclamation fences the old worker.
  update public.replan_jobs set lease_expires_at = clock_timestamp() - interval '1 second' where id = j.id;
  c := public.claim_replan_job();
  blocked := false;
  begin perform public.complete_replan_job(j.id, j.lease_token, ids, payload);
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'expired worker published'; end if;
  j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  perform public.renew_replan_lease(j.id, j.lease_token);
  perform public.cancel_replan_job(u, j.id);
  -- Branching discards redo without duplicating history on undo.
  select revision into rev from public.planning_schedules where user_id = u;
  perform public.undo_planning_change(u, changes[4], rev);
  select array_agg(id) into ids from public.workouts where superseded_at is null;
  j := public.enqueue_adjustment(u, 'branch', 'new request', current_date, current_date);
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  r := public.complete_replan_job(j.id, j.lease_token, ids, payload);
  if (select status from public.planning_changes where id = changes[4]) <> 'discarded' then
    raise exception 'redo branch not discarded';
  end if;
  -- Result updates invalidate workers and protect both undo and replacement.
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(r->'workout_ids');
  select revision into rev from public.planning_schedules where user_id = u;
  rev := public.record_workout_results(u, ids[1], rev, 'completed');
  blocked := false;
  begin perform public.undo_planning_change(u, (r->>'change_id')::uuid, rev);
  exception when sqlstate 'PT409' then blocked := true; end;
  if not blocked then raise exception 'completed workout undone'; end if;
  -- Public callers cannot mutate planning state or invoke worker RPCs.
  if has_function_privilege('authenticated', 'public.complete_replan_job(uuid,uuid,uuid[],jsonb)', 'execute')
    or has_table_privilege('authenticated', 'public.workouts', 'update') then
    raise exception 'client can bypass transaction guards';
  end if;
  -- No-op proposals finish without an empty change or discarded redo branch.
  j := public.enqueue_adjustment(u, 'noop', 'review only', current_date, current_date);
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  select count(*) into before_count from public.planning_changes;
  r := public.complete_replan_job(j.id, j.lease_token, '{}'::uuid[], '[]');
  if r->>'change_id' is not null or (select count(*) from public.planning_changes) <> before_count then
    raise exception 'no-op created a change';
  end if;
  -- Terminal failure can be retried explicitly without a duplicate request.
  j := public.enqueue_adjustment(u, 'retry', 'retry test', current_date, current_date);
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  perform public.fail_replan_job(j.id, j.lease_token, 'failure', false);
  if (public.retry_replan_job(u, j.id)).status <> 'pending' then raise exception 'terminal retry failed'; end if;
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  perform public.fail_replan_job(j.id, j.lease_token, 'temporary', true);
  if (select available_at <= clock_timestamp() from public.replan_jobs where id = j.id) then
    raise exception 'retry backoff missing';
  end if;
  perform public.cancel_replan_job(u, j.id);
  -- Catch-up stays anchored to local time, including DST changes across missed weeks.
  update public.profiles set timezone = 'America/New_York' where id = u;
  perform public.configure_planning_schedule(u, '2020-03-01 09:00 America/New_York', 14, 7);
  if public.enqueue_due_replans() <> 1 then raise exception 'catch-up enqueue failed'; end if;
  c := public.claim_replan_job(); j := jsonb_populate_record(null::public.replan_jobs, c->'job');
  if extract(hour from j.scheduled_for at time zone 'America/New_York') <> 9
    or extract(dow from j.scheduled_for at time zone 'America/New_York') <> 0 then
    raise exception 'catch-up drifted from sunday at nine';
  end if;
  r := public.complete_replan_job(j.id, j.lease_token, '{}'::uuid[], '[]');
  select revision, next_refresh_at into rev, due from public.planning_schedules where user_id = u;
  if extract(hour from due at time zone 'America/New_York') <> 9 or due <= clock_timestamp() then
    raise exception 'refresh failed to advance anchored cadence';
  end if;
  perform public.undo_planning_change(u, (r->>'change_id')::uuid, rev);
  if (select next_refresh_at from public.planning_schedules where user_id = u) <> due then
    raise exception 'undo refresh shifted cadence';
  end if;
  blocked := false;
  begin perform public.purge_replan_jobs(clock_timestamp());
  exception when sqlstate 'PT400' then blocked := true; end;
  if not blocked then raise exception 'retention boundary ignored'; end if;
  update public.replan_jobs set completed_at = clock_timestamp() - interval '40 days'
  where id = j.id;
  if public.purge_replan_jobs(clock_timestamp() - interval '30 days', 1) <> 1 then
    raise exception 'terminal job purge failed';
  end if;
  if not exists(select 1 from public.planning_changes where id = j.id) then
    raise exception 'job purge removed history';
  end if;
  raise notice 'planning rpc integration checks passed';
end;
$$;
rollback;
