-- The runner applies this only after the explicit stage-two SQL, in a rollback transaction.
do $$
declare target text; client_role text;
begin
  foreach client_role in array array['anon', 'authenticated'] loop
    foreach target in array array['planning_schedules', 'planning_changes', 'planning_change_workouts',
      'replan_jobs', 'workouts', 'exercises', 'exercise_sets', 'sports_workouts', 'messages', 'conversations'] loop
      if has_table_privilege(client_role, 'public.' || target, 'select,insert,update,delete')
        or has_any_column_privilege(client_role, 'public.' || target, 'select,insert,update') then
        raise exception '% retained direct protected-data privileges on %', client_role, target;
      end if;
      if not has_table_privilege('service_role', 'public.' || target, 'select') then
        raise exception 'backend lost read access to %', target;
      end if;
    end loop;
    if has_function_privilege(client_role, 'public.get_calendar_snapshot(uuid,date,date)', 'execute') then
      raise exception '% retained calendar bypass', client_role;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.profiles', 'select')
    or not has_table_privilege('authenticated', 'public.onboarding_responses', 'select')
    or not has_function_privilege('service_role', 'public.get_calendar_snapshot(uuid,date,date)', 'execute') then
    raise exception 'free setup or protected backend access was removed';
  end if;
end;
$$;

set local role authenticated;
do $$
begin
  begin perform 1 from public.workouts;
    raise exception 'direct training read bypassed payment';
  exception when insufficient_privilege then null; end;
  begin update public.conversations set title = 'bypass' where false;
    raise exception 'column grant bypassed payment';
  exception when insufficient_privilege then null; end;
  begin insert into public.messages(user_id, role, content, conversation_id)
    select gen_random_uuid(), 'user', 'bypass', gen_random_uuid() where false;
    raise exception 'column insert grant bypassed payment';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
