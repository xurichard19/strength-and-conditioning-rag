create or replace function public.replace_planned_workouts(
  p_change_id uuid,
  p_reason text,
  p_effective_from date,
  p_horizon_end date,
  p_expected_workout_ids jsonb,
  p_workouts jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workout jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_workout_id uuid;
  v_exercise_id uuid;
  v_exercise_index integer;
  v_set_index integer;
  v_workout_ids jsonb;
  v_existing_reason text;
  v_existing_from date;
  v_existing_end date;
  v_existing_reverts uuid;
begin
  if v_user_id is null then
    raise sqlstate 'PT401' using message = 'authentication required';
  end if;

  if p_change_id is null then
    raise sqlstate 'PT400' using message = 'change id is required';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise sqlstate 'PT400' using message = 'change reason is required';
  end if;

  if p_effective_from is null or p_horizon_end is null
     or p_effective_from > p_horizon_end then
    raise sqlstate 'PT400' using message = 'invalid planning horizon';
  end if;

  if p_expected_workout_ids is null
     or p_workouts is null
     or jsonb_typeof(p_expected_workout_ids) <> 'array'
     or jsonb_typeof(p_workouts) <> 'array' then
    raise sqlstate 'PT400' using message = 'workouts must be arrays';
  end if;

  if jsonb_array_length(p_workouts) = 0 then
    raise sqlstate 'PT400' using message = 'replacement workouts must not be empty';
  end if;

  -- Only one plan replacement may run for a user at a time.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select reason, effective_from, horizon_end, reverts_change_id
  into v_existing_reason, v_existing_from, v_existing_end, v_existing_reverts
  from public.planning_changes
  where user_id = v_user_id
    and id = p_change_id;

  if found then
    if v_existing_reason is distinct from p_reason
       or v_existing_from is distinct from p_effective_from
       or v_existing_end is distinct from p_horizon_end
       or v_existing_reverts is not null then
      raise sqlstate 'PT409' using message = 'change id already used';
    end if;

    select coalesce(jsonb_agg(id order by scheduled_date, id), '[]'::jsonb)
    into v_workout_ids
    from public.workouts
    where user_id = v_user_id
      and created_by_change_id = p_change_id;

    return jsonb_build_object(
      'change_id', p_change_id,
      'workout_ids', v_workout_ids
    );
  end if;

  if exists (
    (
      select id
      from public.workouts
      where user_id = v_user_id
        and status = 'planned'
        and superseded_at is null
        and scheduled_date between p_effective_from and p_horizon_end
      except
      select value::uuid
      from jsonb_array_elements_text(p_expected_workout_ids)
    )
    union all
    (
      select value::uuid
      from jsonb_array_elements_text(p_expected_workout_ids)
      except
      select id
      from public.workouts
      where user_id = v_user_id
        and status = 'planned'
        and superseded_at is null
        and scheduled_date between p_effective_from and p_horizon_end
    )
  ) then
    raise sqlstate 'PT409' using message = 'planned workouts changed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_workouts) item
    where (item->>'scheduled_date')::date
      not between p_effective_from and p_horizon_end
  ) then
    raise sqlstate 'PT400' using message = 'workout outside planning horizon';
  end if;

  insert into public.planning_changes (
    id,
    user_id,
    reason,
    effective_from,
    horizon_end
  ) values (
    p_change_id,
    v_user_id,
    p_reason,
    p_effective_from,
    p_horizon_end
  );

  update public.workouts
  set
    superseded_at = now(),
    superseded_by_change_id = p_change_id
  where user_id = v_user_id
    and status = 'planned'
    and superseded_at is null
    and scheduled_date between p_effective_from and p_horizon_end;

  for v_workout in
    select value from jsonb_array_elements(p_workouts)
  loop
    insert into public.workouts (
      user_id,
      created_by_change_id,
      scheduled_date,
      name,
      planned_duration_minutes,
      intent,
      notes
    ) values (
      v_user_id,
      p_change_id,
      (v_workout->>'scheduled_date')::date,
      v_workout->>'name',
      (v_workout->>'planned_duration_minutes')::integer,
      v_workout->>'intent',
      v_workout->>'notes'
    )
    returning id into v_workout_id;

    for v_exercise, v_exercise_index in
      select value, ordinality - 1
      from jsonb_array_elements(coalesce(v_workout->'exercises', '[]'::jsonb))
      with ordinality
    loop
      insert into public.exercises (
        workout_id,
        order_index,
        name,
        reps_per_side,
        weight_unit,
        distance_unit,
        notes
      ) values (
        v_workout_id,
        v_exercise_index,
        v_exercise->>'name',
        coalesce((v_exercise->>'reps_per_side')::boolean, false),
        v_exercise->>'weight_unit',
        v_exercise->>'distance_unit',
        v_exercise->>'notes'
      )
      returning id into v_exercise_id;

      for v_set, v_set_index in
        select value, ordinality - 1
        from jsonb_array_elements(coalesce(v_exercise->'sets', '[]'::jsonb))
        with ordinality
      loop
        insert into public.exercise_sets (
          exercise_id,
          order_index,
          planned_reps,
          planned_weight,
          planned_distance,
          planned_duration_seconds,
          planned_rpe,
          planned_rest_seconds,
          planned_notes
        ) values (
          v_exercise_id,
          v_set_index,
          (v_set->>'planned_reps')::integer,
          (v_set->>'planned_weight')::numeric,
          (v_set->>'planned_distance')::numeric,
          (v_set->>'planned_duration_seconds')::integer,
          (v_set->>'planned_rpe')::numeric,
          (v_set->>'planned_rest_seconds')::integer,
          v_set->>'planned_notes'
        );
      end loop;
    end loop;
  end loop;

  select jsonb_agg(id order by scheduled_date, id)
  into v_workout_ids
  from public.workouts
  where user_id = v_user_id
    and created_by_change_id = p_change_id;

  return jsonb_build_object(
    'change_id', p_change_id,
    'workout_ids', v_workout_ids
  );
end;
$$;

create or replace function public.rollback_planning_change(
  p_change_id uuid,
  p_rollback_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_effective_from date;
  v_horizon_end date;
  v_existing_reverts uuid;
  v_old_workout public.workouts%rowtype;
  v_old_exercise public.exercises%rowtype;
  v_old_set public.exercise_sets%rowtype;
  v_workout_id uuid;
  v_exercise_id uuid;
  v_workout_ids jsonb;
begin
  if v_user_id is null then
    raise sqlstate 'PT401' using message = 'authentication required';
  end if;

  if p_change_id is null or p_rollback_id is null then
    raise sqlstate 'PT400' using message = 'change ids are required';
  end if;

  if p_change_id = p_rollback_id then
    raise sqlstate 'PT400' using message = 'rollback id must be different';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise sqlstate 'PT400' using message = 'rollback reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select effective_from, horizon_end
  into v_effective_from, v_horizon_end
  from public.planning_changes
  where id = p_change_id
    and user_id = v_user_id;

  if not found then
    raise sqlstate 'PT404' using message = 'planning change not found';
  end if;

  select reverts_change_id
  into v_existing_reverts
  from public.planning_changes
  where id = p_rollback_id
    and user_id = v_user_id;

  if found then
    if v_existing_reverts is distinct from p_change_id then
      raise sqlstate 'PT409' using message = 'rollback id already used';
    end if;

    select coalesce(jsonb_agg(id order by scheduled_date, id), '[]'::jsonb)
    into v_workout_ids
    from public.workouts
    where user_id = v_user_id
      and created_by_change_id = p_rollback_id;

    return jsonb_build_object(
      'change_id', p_rollback_id,
      'workout_ids', v_workout_ids
    );
  end if;

  if exists (
    select 1
    from public.planning_changes
    where user_id = v_user_id
      and reverts_change_id = p_change_id
  ) then
    raise sqlstate 'PT409' using message = 'planning change already rolled back';
  end if;

  if exists (
    select 1
    from public.workouts
    where user_id = v_user_id
      and created_by_change_id = p_change_id
      and superseded_at is not null
  ) then
    raise sqlstate 'PT409' using message = 'only the latest overlapping change can be rolled back';
  end if;

  if exists (
    select 1
    from public.workouts
    where user_id = v_user_id
      and created_by_change_id = p_change_id
      and superseded_at is null
      and status <> 'planned'
  ) then
    raise sqlstate 'PT409' using message = 'started workouts cannot be rolled back';
  end if;

  insert into public.planning_changes (
    id,
    user_id,
    reason,
    effective_from,
    horizon_end,
    reverts_change_id
  ) values (
    p_rollback_id,
    v_user_id,
    p_reason,
    v_effective_from,
    v_horizon_end,
    p_change_id
  );

  update public.workouts
  set
    superseded_at = now(),
    superseded_by_change_id = p_rollback_id
  where user_id = v_user_id
    and created_by_change_id = p_change_id
    and superseded_at is null
    and status = 'planned';

  for v_old_workout in
    select *
    from public.workouts
    where user_id = v_user_id
      and superseded_by_change_id = p_change_id
    order by scheduled_date, id
  loop
    insert into public.workouts (
      user_id,
      created_by_change_id,
      scheduled_date,
      name,
      planned_duration_minutes,
      intent,
      notes
    ) values (
      v_user_id,
      p_rollback_id,
      v_old_workout.scheduled_date,
      v_old_workout.name,
      v_old_workout.planned_duration_minutes,
      v_old_workout.intent,
      v_old_workout.notes
    )
    returning id into v_workout_id;

    for v_old_exercise in
      select *
      from public.exercises
      where workout_id = v_old_workout.id
      order by order_index
    loop
      insert into public.exercises (
        workout_id,
        order_index,
        name,
        reps_per_side,
        weight_unit,
        distance_unit,
        notes
      ) values (
        v_workout_id,
        v_old_exercise.order_index,
        v_old_exercise.name,
        v_old_exercise.reps_per_side,
        v_old_exercise.weight_unit,
        v_old_exercise.distance_unit,
        v_old_exercise.notes
      )
      returning id into v_exercise_id;

      for v_old_set in
        select *
        from public.exercise_sets
        where exercise_id = v_old_exercise.id
        order by order_index
      loop
        insert into public.exercise_sets (
          exercise_id,
          order_index,
          planned_reps,
          planned_weight,
          planned_distance,
          planned_duration_seconds,
          planned_rpe,
          planned_rest_seconds,
          planned_notes
        ) values (
          v_exercise_id,
          v_old_set.order_index,
          v_old_set.planned_reps,
          v_old_set.planned_weight,
          v_old_set.planned_distance,
          v_old_set.planned_duration_seconds,
          v_old_set.planned_rpe,
          v_old_set.planned_rest_seconds,
          v_old_set.planned_notes
        );
      end loop;
    end loop;
  end loop;

  select coalesce(jsonb_agg(id order by scheduled_date, id), '[]'::jsonb)
  into v_workout_ids
  from public.workouts
  where user_id = v_user_id
    and created_by_change_id = p_rollback_id;

  return jsonb_build_object(
    'change_id', p_rollback_id,
    'workout_ids', v_workout_ids
  );
end;
$$;

comment on function public.replace_planned_workouts(uuid, text, date, date, jsonb, jsonb)
is 'Atomically records a planning change and replaces current planned workouts in its date range. The change id makes retries idempotent, and expected workout ids prevent overwriting a concurrently changed schedule.';

revoke all on function public.replace_planned_workouts(uuid, text, date, date, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.replace_planned_workouts(uuid, text, date, date, jsonb, jsonb)
to authenticated;

comment on function public.rollback_planning_change(uuid, uuid, text)
is 'Atomically rolls back the latest overlapping planning change by superseding its current workouts and copying the prior workout snapshot into a new rollback change.';

revoke all on function public.rollback_planning_change(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.rollback_planning_change(uuid, uuid, text)
to authenticated;

notify pgrst, 'reload schema';
