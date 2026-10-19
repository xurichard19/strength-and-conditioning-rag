-- One bounded calendar read; caller RLS applies to every table in the snapshot.
create function public.get_calendar_snapshot(p_user_id uuid, p_start_date date, p_end_date date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_start_date is null or p_end_date is null
    or p_end_date - p_start_date not between 0 and 30 then
    raise sqlstate 'PT400' using message = 'calendar requires a user and 1 to 31 days';
  end if;

  return jsonb_build_object(
    'revision', (select revision from public.planning_schedules where user_id = p_user_id),
    'workouts', coalesce((
      select jsonb_agg(to_jsonb(w) || jsonb_build_object('exercises', coalesce((
        select jsonb_agg(to_jsonb(e) || jsonb_build_object('sets', coalesce((
          select jsonb_agg(s order by s.order_index)
          from public.exercise_sets s where s.exercise_id = e.id
        ), '[]'::jsonb)) order by e.order_index)
        from public.exercises e where e.workout_id = w.id
      ), '[]'::jsonb)) order by w.scheduled_date, w.id)
      from public.workouts w
      where w.user_id = p_user_id and w.scheduled_date between p_start_date and p_end_date
        and w.superseded_at is null
    ), '[]'::jsonb),
    'sports_workouts', coalesce((
      select jsonb_agg(s order by s.scheduled_date, s.start_time nulls last, s.id)
      from public.sports_workouts s
      where s.user_id = p_user_id and s.scheduled_date between p_start_date and p_end_date
        and s.status <> 'cancelled'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_calendar_snapshot(uuid, date, date) from public, anon;
grant execute on function public.get_calendar_snapshot(uuid, date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
