drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.replace_planned_workouts(
  uuid,
  text,
  date,
  date,
  jsonb,
  jsonb
);

drop function if exists public.rollback_planning_change(uuid, uuid, text);

drop table if exists public.exercise_sets cascade;
drop table if exists public.exercises cascade;
drop table if exists public.workouts cascade;
drop table if exists public.planning_changes cascade;
drop table if exists public.messages cascade;
drop table if exists public.sports_workouts cascade;
drop table if exists public.onboarding_responses cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
