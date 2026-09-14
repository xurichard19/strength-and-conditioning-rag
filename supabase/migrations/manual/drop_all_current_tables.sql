drop trigger if exists on_auth_user_created on auth.users;

do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'configure_planning_schedule', 'enqueue_adjustment', 'enqueue_due_replans', 'claim_replan_job',
      'renew_replan_lease', 'fail_replan_job', 'cancel_replan_job', 'retry_replan_job', 'purge_replan_jobs',
      'invalidate_planning_inputs', 'workout_has_results', 'complete_replan_job',
      'set_planning_change_applied', 'undo_planning_change', 'redo_planning_change',
      'record_workout_results', 'bump_planning_input_revision'])
  loop
    execute format('drop function if exists %s cascade', v_function);
  end loop;
end;
$$;

drop table if exists public.exercise_sets cascade;
drop table if exists public.replan_jobs cascade;
drop table if exists public.planning_change_workouts cascade;
drop table if exists public.planning_schedules cascade;
drop table if exists public.exercises cascade;
drop table if exists public.workouts cascade;
drop table if exists public.planning_changes cascade;
drop table if exists public.messages cascade;
drop table if exists public.sports_workouts cascade;
drop table if exists public.onboarding_responses cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
