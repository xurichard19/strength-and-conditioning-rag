alter table public.exercises
add column completed_at timestamptz;

comment on column public.exercises.completed_at is
  'Completion instant; null means the exercise is incomplete.';
