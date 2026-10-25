\set ON_ERROR_STOP on
begin;
insert into auth.users values
  ('11111111-1111-4111-8111-111111111111', 'calendar-one@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'calendar-two@example.invalid');

do $$
declare u uuid := '11111111-1111-4111-8111-111111111111'; invalid record;
begin
  if public.get_calendar_snapshot(u, current_date, current_date + 30)
    is distinct from '{"workouts":[],"sports_workouts":[],"revision":null}'::jsonb then
    raise exception 'unconfigured calendar did not return empty lists and null revision';
  end if;
  for invalid in select * from (values (null::date, current_date), (current_date, null::date),
    (current_date, current_date - 1), (current_date, current_date + 31)) as dates(first, last) loop
    begin
      perform public.get_calendar_snapshot(u, invalid.first, invalid.last);
      raise exception 'invalid range accepted';
    exception when sqlstate 'PT400' then null; end;
  end loop;
end;
$$;

insert into public.planning_schedules(user_id, next_refresh_at)
select id, now() from public.profiles;
insert into public.planning_changes(id, user_id, revision, kind, reason, effective_from, effective_through, horizon_end_after)
select id, id, 1, 'refresh', 'calendar fixture', current_date, current_date + 30, current_date + 30 from public.profiles;
insert into public.workouts(id, user_id, created_by_change_id, scheduled_date, name, status, superseded_at)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  u, u, current_date + days, name, status, case when n = 4 then now() end
from (values (1, 0, 'first', 'completed'), (2, 0, 'second', 'in_progress'), (3, 30, 'last', 'skipped'),
  (4, 0, 'superseded', 'planned'), (5, -1, 'before', 'planned'), (6, 31, 'after', 'planned'))
  as rows(n, days, name, status)
cross join (select '11111111-1111-4111-8111-111111111111'::uuid as u) owner;
insert into public.workouts(user_id, created_by_change_id, scheduled_date, name)
values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', current_date, 'other user');
insert into public.exercises(id, workout_id, order_index, name, weight_unit)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '00000000-0000-4000-8000-000000000001', 1, 'row', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '00000000-0000-4000-8000-000000000001', 0, 'squat', 'kg');
insert into public.exercise_sets(exercise_id, order_index, planned_reps, planned_weight, actual_reps, result_status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1, 8, 50, null, 'pending'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 0, 5, 60, 5, 'completed');
insert into public.sports_workouts(user_id, sport, scheduled_date, start_time, status)
select '11111111-1111-4111-8111-111111111111', sport, current_date + days, start_time::time, status
from (values ('untimed', 0, null, 'planned'), ('evening', 0, '18:00', 'planned'),
  ('morning', 0, '08:00', 'completed'), ('last day', 30, null, 'planned'),
  ('cancelled', 0, null, 'cancelled'), ('before', -1, null, 'planned'), ('after', 31, null, 'planned'))
  as rows(sport, days, start_time, status);
insert into public.sports_workouts(user_id, sport, scheduled_date)
values ('22222222-2222-4222-8222-222222222222', 'private sport', current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare result jsonb; names jsonb; rev bigint;
begin
  result := public.get_calendar_snapshot(auth.uid(), current_date, current_date + 30);
  select revision into rev from public.planning_schedules where user_id = auth.uid();
  if (result->>'revision')::bigint is distinct from rev then raise exception 'revision missing'; end if;
  select jsonb_agg(row->>'name') into names from jsonb_array_elements(result->'workouts') row;
  if names is distinct from '["first","second","last"]'::jsonb then raise exception 'workout filters/order changed: %', names; end if;
  if result #>> '{workouts,0,exercises,0,name}' is distinct from 'squat'
    or result #>> '{workouts,0,exercises,0,weight_unit}' is distinct from 'kg'
    or ((result #> '{workouts,0,exercises,0,sets,0}') @>
      '{"order_index":0,"planned_reps":5,"planned_weight":60,"actual_reps":5,"result_status":"completed"}') is distinct from true
    or result #>> '{workouts,0,exercises,0,sets,1,planned_reps}' is distinct from '8'
    or result #> '{workouts,0,exercises,1,sets}' is distinct from '[]'::jsonb
    or result #> '{workouts,1,exercises}' is distinct from '[]'::jsonb then
    raise exception 'nested prescriptions/results/order or empty arrays changed';
  end if;
  select jsonb_agg(row->>'sport') into names from jsonb_array_elements(result->'sports_workouts') row;
  if names is distinct from '["morning","evening","untimed","last day"]'::jsonb then
    raise exception 'sports filters/order changed: %', names;
  end if;
  if public.get_calendar_snapshot(auth.uid(), current_date + 40, current_date + 40)
    is distinct from jsonb_build_object('revision', rev, 'workouts', '[]'::jsonb, 'sports_workouts', '[]'::jsonb) then
    raise exception 'empty range lost configured revision';
  end if;
  if public.get_calendar_snapshot('22222222-2222-4222-8222-222222222222', current_date, current_date + 30)
    is distinct from '{"workouts":[],"sports_workouts":[],"revision":null}'::jsonb then
    raise exception 'calendar exposed another account';
  end if;
end;
$$;

set local role anon;
do $$
begin
  perform public.get_calendar_snapshot('11111111-1111-4111-8111-111111111111', current_date, current_date);
  raise exception 'anonymous calendar access accepted';
exception when insufficient_privilege then null;
end;
$$;

set local role service_role;
do $$
begin
  if public.get_calendar_snapshot('22222222-2222-4222-8222-222222222222', current_date, current_date)
    #>> '{workouts,0,name}' is distinct from 'other user' then raise exception 'backend read failed'; end if;
end;
$$;
rollback;
