drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.exercises cascade;
drop table if exists public.exercise cascade;
drop table if exists public.workout_exercises cascade;
drop table if exists public.workouts cascade;
drop table if exists public.workout_plan_exercises cascade;
drop table if exists public.workout_plan_days cascade;
drop table if exists public.workout_plans cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
