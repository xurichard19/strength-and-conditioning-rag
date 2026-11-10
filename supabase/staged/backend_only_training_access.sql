-- STAGE TWO ONLY: apply in a transaction after the compatible backend is deployed
-- and old API revisions have drained. Keep this outside supabase/migrations so
-- the migration-before-deploy workflow cannot break the still-running old API.
-- Profile, onboarding, Auth, and service-role access remain unchanged.
revoke all privileges on table
  public.planning_schedules, public.planning_changes, public.planning_change_workouts,
  public.replan_jobs, public.workouts, public.exercises, public.exercise_sets,
  public.sports_workouts, public.messages, public.conversations
from public, anon, authenticated;

-- Table-level revocation does not remove separately granted column privileges.
revoke insert (user_id, role, content, conversation_id) on public.messages
from public, anon, authenticated;
revoke update (title) on public.conversations from public, anon, authenticated;

revoke all privileges on function public.get_calendar_snapshot(uuid, date, date)
from public, anon, authenticated;

notify pgrst, 'reload schema';
