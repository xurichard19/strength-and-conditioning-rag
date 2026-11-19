-- Existing accounts receive a 21-day installation grace period. Deploy foreground
-- reporting before applying staged/planning_inactivity.sql; auth refreshes are not activity.
alter table public.profiles
  add column last_active_at timestamptz not null default now(),
  add constraint profiles_last_active_finite check (isfinite(last_active_at));

create index profiles_last_active_idx on public.profiles(last_active_at, id);

-- Preserve existing profile writes, but keep the activity clock server-owned.
-- Table privileges override column revocations, so replace the broad write grants.
revoke insert, update on public.profiles from public, anon, authenticated;
grant insert (id, email, display_name, timezone, created_at, updated_at),
  update (id, email, display_name, timezone, created_at, updated_at)
on public.profiles to authenticated;

create function public.planning_activity_allowed(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog, public as $$
  select exists(select 1 from public.profiles
    where id = p_user_id and last_active_at > statement_timestamp() - interval '504 hours');
$$;

create function public.record_user_activity(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_last_active timestamptz; v_now timestamptz; v_schedule public.planning_schedules;
  v_job public.replan_jobs;
begin
  if p_user_id is null then raise sqlstate 'PT400' using message = 'user required'; end if;
  -- Profile before schedule, matching profile/timezone writers. Workers never lock
  -- profiles while holding schedule locks. Repeated reports share the same clock.
  select last_active_at into v_last_active from public.profiles where id = p_user_id for update;
  if not found then return null; end if;
  v_now := clock_timestamp();
  if v_last_active <= v_now - interval '6 hours' then
    update public.profiles set last_active_at = v_now where id = p_user_id;
    v_last_active := v_now;
  end if;
  -- Recording free-account activity must neither initialize planning nor grant access.
  if exists(select 1 from public.onboarding_responses
    where user_id = p_user_id and completed_at is not null) then
    select * into v_schedule from public.planning_schedules where user_id = p_user_id for update;
    if found then
      if v_schedule.billing_pause_reason is null then
        perform public.enqueue_planning_refresh(p_user_id);
      elsif v_schedule.billing_wake_token is null then
        -- Re-enter existing billing reconciliation on return, without clearing its
        -- pause or doing provider work inside the transaction.
        update public.planning_schedules set billing_wake_token = gen_random_uuid(),
          billing_recheck_at = v_now where user_id = p_user_id;
      end if;
      select * into v_job from public.replan_jobs where user_id = p_user_id
        and kind = 'refresh' and status in ('pending', 'running')
      order by created_at, id limit 1;
    end if;
  end if;
  -- Internal record only; the eventual HTTP handler must serialize safe job fields.
  return jsonb_build_object('last_active_at', v_last_active,
    'refresh_job', case when v_job.id is not null then to_jsonb(v_job) else null end);
end;
$$;

revoke all on function public.planning_activity_allowed(uuid), public.record_user_activity(uuid)
from public, anon, authenticated;
grant execute on function public.planning_activity_allowed(uuid), public.record_user_activity(uuid)
to service_role;

notify pgrst, 'reload schema';
