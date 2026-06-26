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

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  title text,
  goal text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'skipped', 'archived')),
  notes text,
  source_request jsonb not null default '{}'::jsonb,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_user_id_idx on public.workouts(user_id);
create index workouts_user_scheduled_date_idx on public.workouts(user_id, scheduled_date);
create index workouts_user_status_idx on public.workouts(user_id, status);

create trigger set_workouts_updated_at
before update on public.workouts
for each row execute function public.set_updated_at();

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
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

create index exercises_workout_id_idx on public.exercises(workout_id);
create index exercises_order_idx on public.exercises(workout_id, order_index);

create trigger set_exercises_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;

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

create policy "Users can read own workouts"
on public.workouts
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own workouts"
on public.workouts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own workouts"
on public.workouts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own workouts"
on public.workouts
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own workout exercises"
on public.exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
  )
);

create policy "Users can insert own workout exercises"
on public.exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
  )
);

create policy "Users can update own workout exercises"
on public.exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
  )
);

create policy "Users can delete own workout exercises"
on public.exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workouts
    where workouts.id = exercises.workout_id
      and workouts.user_id = auth.uid()
  )
);
