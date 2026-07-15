alter table public.profiles
add column primary_goal text,
add column training_days_per_week smallint,
add column session_duration_minutes smallint,
add column equipment_access text,
add column onboarding_completed_at timestamptz;

alter table public.profiles
add constraint profiles_display_name_length_check
check (
  display_name is null
  or char_length(btrim(display_name)) between 1 and 60
) not valid,
add constraint profiles_experience_level_check
check (
  experience_level is null
  or experience_level in ('new', 'intermediate', 'experienced')
) not valid,
add constraint profiles_primary_goal_check
check (
  primary_goal is null
  or primary_goal in (
    'balanced_hybrid',
    'strength',
    'endurance',
    'conditioning',
    'event_preparation',
    'general_fitness'
  )
),
add constraint profiles_training_days_per_week_check
check (
  training_days_per_week is null
  or training_days_per_week between 2 and 7
),
add constraint profiles_session_duration_minutes_check
check (
  session_duration_minutes is null
  or session_duration_minutes in (30, 45, 60, 75, 90)
),
add constraint profiles_equipment_access_check
check (
  equipment_access is null
  or equipment_access in ('full_gym', 'home_gym', 'minimal_equipment', 'bodyweight_only')
),
add constraint profiles_onboarding_completion_check
check (
  onboarding_completed_at is null
  or (
    nullif(btrim(display_name), '') is not null
    and experience_level is not null
    and primary_goal is not null
    and training_days_per_week is not null
    and session_duration_minutes is not null
    and equipment_access is not null
  )
);
