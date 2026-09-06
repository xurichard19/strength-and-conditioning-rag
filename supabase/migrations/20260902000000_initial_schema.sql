create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_check check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 60
  ),
  constraint profiles_timezone_check check (char_length(btrim(timezone)) > 0)
);

create table public.onboarding_responses (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_answers_object_check check (jsonb_typeof(answers) = 'object')
);

create table public.planning_changes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  effective_from date not null,
  horizon_end date not null,
  reverts_change_id uuid,
  created_at timestamptz not null default now(),
  constraint planning_changes_owner_key unique (id, user_id),
  constraint planning_changes_reverts_owner_fk
    foreign key (reverts_change_id, user_id)
    references public.planning_changes(id, user_id),
  constraint planning_changes_reason_check check (char_length(btrim(reason)) > 0),
  constraint planning_changes_horizon_check check (horizon_end >= effective_from),
  constraint planning_changes_not_self_reverting_check check (reverts_change_id <> id)
);

create index planning_changes_user_created_idx
on public.planning_changes(user_id, created_at desc);

create index planning_changes_reverts_idx
on public.planning_changes(user_id, reverts_change_id)
where reverts_change_id is not null;

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by_change_id uuid not null,
  scheduled_date date not null,
  name text not null,
  planned_duration_minutes integer,
  intent text,
  status text not null default 'planned',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  superseded_at timestamptz,
  superseded_by_change_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workouts_created_by_change_owner_fk
    foreign key (created_by_change_id, user_id)
    references public.planning_changes(id, user_id),
  constraint workouts_superseded_by_change_owner_fk
    foreign key (superseded_by_change_id, user_id)
    references public.planning_changes(id, user_id),
  constraint workouts_name_check check (char_length(btrim(name)) > 0),
  constraint workouts_duration_check check (
    planned_duration_minutes is null or planned_duration_minutes >= 0
  ),
  constraint workouts_status_check check (
    status in ('planned', 'in_progress', 'completed', 'skipped')
  )
);

create index workouts_user_date_active_idx
on public.workouts(user_id, scheduled_date)
where superseded_at is null;

create index workouts_created_by_change_idx
on public.workouts(user_id, created_by_change_id);

create index workouts_superseded_by_change_idx
on public.workouts(user_id, superseded_by_change_id)
where superseded_by_change_id is not null;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  order_index integer not null default 0,
  name text not null,
  reps_per_side boolean not null default false,
  weight_unit text,
  distance_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_workout_order_key unique (workout_id, order_index),
  constraint exercises_order_check check (order_index >= 0),
  constraint exercises_name_check check (char_length(btrim(name)) > 0),
  constraint exercises_weight_unit_check check (
    weight_unit is null or weight_unit in ('kg', 'lb')
  ),
  constraint exercises_distance_unit_check check (
    distance_unit is null or distance_unit in ('m', 'km', 'mi')
  )
);

create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  order_index integer not null default 0,
  planned_reps integer,
  planned_weight numeric,
  planned_distance numeric,
  planned_duration_seconds integer,
  planned_rpe numeric,
  planned_rest_seconds integer,
  planned_notes text,
  actual_reps integer,
  actual_weight numeric,
  actual_distance numeric,
  actual_duration_seconds integer,
  actual_rpe numeric,
  result_status text not null default 'pending',
  result_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_sets_exercise_order_key unique (exercise_id, order_index),
  constraint exercise_sets_order_check check (order_index >= 0),
  constraint exercise_sets_planned_reps_check check (
    planned_reps is null or planned_reps > 0
  ),
  constraint exercise_sets_planned_weight_check check (
    planned_weight is null or planned_weight >= 0
  ),
  constraint exercise_sets_planned_distance_check check (
    planned_distance is null or planned_distance > 0
  ),
  constraint exercise_sets_planned_duration_check check (
    planned_duration_seconds is null or planned_duration_seconds > 0
  ),
  constraint exercise_sets_planned_rpe_check check (
    planned_rpe is null or planned_rpe between 1 and 10
  ),
  constraint exercise_sets_planned_rest_check check (
    planned_rest_seconds is null or planned_rest_seconds >= 0
  ),
  constraint exercise_sets_actual_reps_check check (
    actual_reps is null or actual_reps >= 0
  ),
  constraint exercise_sets_actual_weight_check check (
    actual_weight is null or actual_weight >= 0
  ),
  constraint exercise_sets_actual_distance_check check (
    actual_distance is null or actual_distance >= 0
  ),
  constraint exercise_sets_actual_duration_check check (
    actual_duration_seconds is null or actual_duration_seconds >= 0
  ),
  constraint exercise_sets_actual_rpe_check check (
    actual_rpe is null or actual_rpe between 1 and 10
  ),
  constraint exercise_sets_result_status_check check (
    result_status in ('pending', 'completed', 'skipped')
  )
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('user', 'assistant')),
  constraint messages_content_check check (char_length(content) > 0)
);

create index messages_user_created_idx
on public.messages(user_id, created_at desc);

create table public.sports_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport text not null,
  scheduled_date date not null,
  start_time time,
  planned_duration_minutes integer,
  intensity text,
  status text not null default 'planned',
  notes text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_workouts_sport_check check (char_length(btrim(sport)) > 0),
  constraint sports_workouts_duration_check check (
    planned_duration_minutes is null or planned_duration_minutes > 0
  ),
  constraint sports_workouts_intensity_check check (
    intensity is null or intensity in ('easy', 'moderate', 'hard', 'variable')
  ),
  constraint sports_workouts_status_check check (
    status in ('planned', 'completed', 'cancelled')
  )
);

create index sports_workouts_user_date_active_idx
on public.sports_workouts(user_id, scheduled_date)
where status <> 'cancelled';

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_onboarding_responses_updated_at
before update on public.onboarding_responses
for each row execute function public.set_updated_at();

create trigger set_workouts_updated_at
before update on public.workouts
for each row execute function public.set_updated_at();

create trigger set_exercises_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

create trigger set_exercise_sets_updated_at
before update on public.exercise_sets
for each row execute function public.set_updated_at();

create trigger set_sports_workouts_updated_at
before update on public.sports_workouts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.planning_changes enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.messages enable row level security;
alter table public.sports_workouts enable row level security;

create policy profiles_owner_policy
on public.profiles
for all
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy onboarding_responses_owner_policy
on public.onboarding_responses
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy planning_changes_owner_policy
on public.planning_changes
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy workouts_owner_policy
on public.workouts
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy exercises_owner_policy
on public.exercises
for all
to authenticated
using (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = (select auth.uid())
  )
);

create policy exercise_sets_owner_policy
on public.exercise_sets
for all
to authenticated
using (
  exists (
    select 1
    from public.exercises
    join public.workouts on workouts.id = exercises.workout_id
    where exercises.id = exercise_sets.exercise_id
      and workouts.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.exercises
    join public.workouts on workouts.id = exercises.workout_id
    where exercises.id = exercise_sets.exercise_id
      and workouts.user_id = (select auth.uid())
  )
);

create policy messages_owner_policy
on public.messages
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy sports_workouts_owner_policy
on public.sports_workouts
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.onboarding_responses from anon, authenticated;
revoke all on table public.planning_changes from anon, authenticated;
revoke all on table public.workouts from anon, authenticated;
revoke all on table public.exercises from anon, authenticated;
revoke all on table public.exercise_sets from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.sports_workouts from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.onboarding_responses to authenticated;
grant select, insert on table public.planning_changes to authenticated;
grant select, insert, update, delete on table public.workouts to authenticated;
grant select, insert, update, delete on table public.exercises to authenticated;
grant select, insert, update, delete on table public.exercise_sets to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.sports_workouts to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
