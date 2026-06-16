create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
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
  experience_level text,
  long_term_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  goal text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  starts_on date,
  ends_on date,
  source_request jsonb not null default '{}'::jsonb,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_plans_user_id_idx on public.workout_plans(user_id);
create index workout_plans_user_status_idx on public.workout_plans(user_id, status);

create trigger set_workout_plans_updated_at
before update on public.workout_plans
for each row execute function public.set_updated_at();

create table public.workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_index int not null check (day_index between 0 and 6),
  label text not null check (label in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  scheduled_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, day_index),
  unique (plan_id, label)
);

create index workout_plan_days_plan_id_idx on public.workout_plan_days(plan_id);
create index workout_plan_days_scheduled_date_idx on public.workout_plan_days(scheduled_date);

create trigger set_workout_plan_days_updated_at
before update on public.workout_plan_days
for each row execute function public.set_updated_at();

create table public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.workout_plan_days(id) on delete cascade,
  order_index int not null default 0,
  name text not null,
  sets int check (sets is null or sets > 0),
  reps text,
  duration text,
  rest text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_plan_exercises_plan_day_id_idx on public.workout_plan_exercises(plan_day_id);
create index workout_plan_exercises_order_idx on public.workout_plan_exercises(plan_day_id, order_index);

create trigger set_workout_plan_exercises_updated_at
before update on public.workout_plan_exercises
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_plan_days enable row level security;
alter table public.workout_plan_exercises enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can read own workout plans"
on public.workout_plans
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own workout plans"
on public.workout_plans
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own workout plans"
on public.workout_plans
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own workout plans"
on public.workout_plans
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own workout plan days"
on public.workout_plan_days
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_plans
    where workout_plans.id = workout_plan_days.plan_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can insert own workout plan days"
on public.workout_plan_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_plans
    where workout_plans.id = workout_plan_days.plan_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can update own workout plan days"
on public.workout_plan_days
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_plans
    where workout_plans.id = workout_plan_days.plan_id
      and workout_plans.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_plans
    where workout_plans.id = workout_plan_days.plan_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can delete own workout plan days"
on public.workout_plan_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_plans
    where workout_plans.id = workout_plan_days.plan_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can read own workout plan exercises"
on public.workout_plan_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_plan_days
    join public.workout_plans on workout_plans.id = workout_plan_days.plan_id
    where workout_plan_days.id = workout_plan_exercises.plan_day_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can insert own workout plan exercises"
on public.workout_plan_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_plan_days
    join public.workout_plans on workout_plans.id = workout_plan_days.plan_id
    where workout_plan_days.id = workout_plan_exercises.plan_day_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can update own workout plan exercises"
on public.workout_plan_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_plan_days
    join public.workout_plans on workout_plans.id = workout_plan_days.plan_id
    where workout_plan_days.id = workout_plan_exercises.plan_day_id
      and workout_plans.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_plan_days
    join public.workout_plans on workout_plans.id = workout_plan_days.plan_id
    where workout_plan_days.id = workout_plan_exercises.plan_day_id
      and workout_plans.user_id = auth.uid()
  )
);

create policy "Users can delete own workout plan exercises"
on public.workout_plan_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_plan_days
    join public.workout_plans on workout_plans.id = workout_plan_days.plan_id
    where workout_plan_days.id = workout_plan_exercises.plan_day_id
      and workout_plans.user_id = auth.uid()
  )
);
