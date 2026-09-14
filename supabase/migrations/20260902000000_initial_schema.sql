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

-- Advance next_refresh_at from its previous due date in the user's timezone.
-- Increment revision for schedule changes AND changes to planning inputs.
create table public.planning_schedules (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  horizon_days integer not null default 7 check (horizon_days > 0),
  refresh_interval_days integer not null default 7
    check (refresh_interval_days > 0 and refresh_interval_days <= horizon_days),
  horizon_end date,
  next_refresh_at timestamptz not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planning_schedules_due_idx on public.planning_schedules(next_refresh_at);

-- Undo/redo updates status and active workout markers, never copies workout trees.
-- revision is the original commit order; discarded changes cannot be redone.
create table public.planning_changes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  revision bigint not null check (revision > 0),
  kind text not null check (kind in ('adjustment', 'refresh')),
  status text not null default 'applied' check (status in ('applied', 'undone', 'discarded')),
  reason text not null,
  effective_from date not null,
  effective_through date not null,
  horizon_end_before date,
  horizon_end_after date not null,
  created_at timestamptz not null default now(),
  constraint planning_changes_owner_key unique (id, user_id),
  constraint planning_changes_revision_key unique (user_id, revision),
  constraint planning_changes_reason_check check (char_length(btrim(reason)) > 0),
  constraint planning_changes_horizon_check check (
    effective_from <= effective_through and effective_through <= horizon_end_after
  ),
  constraint planning_changes_extension_check check (
    horizon_end_before is null or horizon_end_after >= horizon_end_before
  ),
  constraint planning_changes_adjustment_check check (
    kind <> 'adjustment' or
    (horizon_end_before is not null and horizon_end_before = horizon_end_after)
  )
);

create index planning_changes_user_created_idx
on public.planning_changes(user_id, created_at desc);

create index planning_changes_history_idx
on public.planning_changes(user_id, status, revision);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by_change_id uuid not null,
  scheduled_date date not null,
  name text not null,
  status text not null default 'planned',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workouts_created_by_change_owner_fk
    foreign key (created_by_change_id, user_id)
    references public.planning_changes(id, user_id),
  constraint workouts_owner_key unique (id, user_id),
  constraint workouts_name_check check (char_length(btrim(name)) > 0),
  constraint workouts_status_check check (
    status in ('planned', 'in_progress', 'completed', 'skipped')
  )
);

create index workouts_user_date_active_idx
on public.workouts(user_id, scheduled_date)
where superseded_at is null;

create index workouts_created_by_change_idx
on public.workouts(user_id, created_by_change_id);

-- Each changed workout appears on one side; unchanged rows are omitted.
create table public.planning_change_workouts (
  change_id uuid not null,
  workout_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  side text not null check (side in ('before', 'after')),
  primary key (change_id, workout_id),
  foreign key (change_id, user_id) references public.planning_changes(id, user_id),
  foreign key (workout_id, user_id) references public.workouts(id, user_id)
);

create index planning_change_workouts_workout_idx
on public.planning_change_workouts(workout_id, user_id);

-- Workers capture revision at claim time. Leases fence off expired workers.
-- scheduled_for identifies a refresh occurrence; adjustments have no occurrence.
create table public.replan_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('adjustment', 'refresh')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  reason text not null check (char_length(btrim(reason)) > 0),
  deduplication_key text not null check (char_length(btrim(deduplication_key)) > 0),
  effective_from date,
  effective_through date,
  scheduled_for timestamptz,
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  expected_revision bigint check (expected_revision >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  change_id uuid,
  error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, deduplication_key),
  foreign key (change_id, user_id) references public.planning_changes(id, user_id),
  check ((kind = 'refresh') = (scheduled_for is not null)),
  constraint replan_jobs_window_check check (
    (kind = 'adjustment' and effective_from is not null and effective_through is not null
      and effective_from <= effective_through)
    or (kind = 'refresh' and effective_from is null and effective_through is null)
  ),
  check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null
      and expected_revision is not null)
    or (status <> 'running' and lease_token is null and lease_expires_at is null)
  ),
  check ((status in ('succeeded', 'failed', 'cancelled')) = (completed_at is not null)),
  check (change_id is null or status = 'succeeded')
);

create unique index replan_jobs_refresh_occurrence_idx
on public.replan_jobs(user_id, scheduled_for) where kind = 'refresh';
create unique index replan_jobs_one_running_idx
on public.replan_jobs(user_id) where status = 'running';
create unique index replan_jobs_one_pending_adjustment_idx
on public.replan_jobs(user_id) where status = 'pending' and kind = 'adjustment';
create index replan_jobs_claim_idx
on public.replan_jobs(available_at, id) where status = 'pending';
create index replan_jobs_expired_idx
on public.replan_jobs(lease_expires_at) where status = 'running';
create index replan_jobs_retention_idx
on public.replan_jobs(completed_at) where completed_at is not null;

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

create trigger set_planning_schedules_updated_at
before update on public.planning_schedules
for each row execute function public.set_updated_at();

create trigger set_replan_jobs_updated_at
before update on public.replan_jobs
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
alter table public.planning_schedules enable row level security;
alter table public.planning_change_workouts enable row level security;
alter table public.replan_jobs enable row level security;
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

-- Clients may inspect their schedules and history; trusted workers publish them.
create policy planning_schedules_owner_read on public.planning_schedules
for select to authenticated using (user_id = (select auth.uid()));

create policy planning_change_workouts_owner_read on public.planning_change_workouts
for select to authenticated using (user_id = (select auth.uid()));

-- Jobs are backend-only: no client policy or grant.

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
revoke all on table public.planning_schedules from anon, authenticated;
revoke all on table public.planning_change_workouts from anon, authenticated;
revoke all on table public.replan_jobs from anon, authenticated;

grant select on table public.planning_schedules, public.planning_change_workouts
to authenticated;
grant all on table public.planning_schedules, public.planning_change_workouts,
  public.replan_jobs, public.planning_changes to service_role;
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
