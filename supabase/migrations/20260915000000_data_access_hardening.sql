-- Forward-only hardening; existing valid profiles, history, and jobs are preserved.

-- Keep timezones editable, but reject names PostgreSQL cannot interpret.
do $$
begin
  if exists (select 1 from public.profiles p
    where not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p.timezone)) then
    raise exception 'correct invalid profile timezones before applying this migration';
  end if;
end;
$$;

create or replace function public.validate_profile_timezone()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise sqlstate 'PT400' using message = 'invalid timezone';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
before insert or update of timezone on public.profiles
for each row execute function public.validate_profile_timezone();
revoke all on function public.validate_profile_timezone() from public, anon, authenticated;

-- AFTER sees the actual upsert outcome, rather than both its insert and update attempts.
-- Compare within the write transaction; timestamps alone do not change planning inputs.
create or replace function public.bump_planning_input_revision()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user_id uuid;
begin
  if tg_table_name = 'profiles' then
    if new.timezone is not distinct from old.timezone then return null; end if;
    v_user_id := new.id;
  else
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return null;
    end if;
    v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  end if;
  update public.planning_schedules set revision = revision + 1 where user_id = v_user_id;
  return null;
end;
$$;

drop trigger profiles_planning_revision on public.profiles;
drop trigger onboarding_planning_revision on public.onboarding_responses;
drop trigger sports_planning_revision on public.sports_workouts;
create trigger profiles_planning_revision after update on public.profiles
for each row execute function public.bump_planning_input_revision();
create trigger onboarding_planning_revision after insert or update or delete on public.onboarding_responses
for each row execute function public.bump_planning_input_revision();
create trigger sports_planning_revision after insert or update or delete on public.sports_workouts
for each row execute function public.bump_planning_input_revision();

-- Local cadence arithmetic shared by selection and insertion; no rolling anchor drift.
create or replace function public.latest_refresh_occurrence(
  p_anchor timestamptz, p_interval_days integer, p_timezone text, p_now timestamptz
) returns timestamptz language plpgsql stable set search_path = pg_catalog as $$
declare v_due timestamp := p_anchor at time zone p_timezone;
  v_now timestamp := p_now at time zone p_timezone;
begin
  v_due := v_due + make_interval(days => greatest(0,
    ((v_now::date - v_due::date) / p_interval_days) * p_interval_days));
  if v_due > v_now then v_due := v_due - make_interval(days => p_interval_days); end if;
  return v_due at time zone p_timezone;
end;
$$;
revoke all on function public.latest_refresh_occurrence(timestamptz, integer, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.latest_refresh_occurrence(timestamptz, integer, text, timestamptz) to service_role;

create or replace function public.enqueue_due_replans(p_limit integer default 100)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_candidate record; v_now timestamptz := clock_timestamp(); v_count integer := 0; v_rows integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise sqlstate 'PT400' using message = 'limit must be between 1 and 1000';
  end if;
  for v_candidate in
    select s.user_id, occurrence.due_at from public.planning_schedules s
    join public.profiles p on p.id = s.user_id
    cross join lateral (
      select public.latest_refresh_occurrence(s.next_refresh_at, s.refresh_interval_days, p.timezone, v_now) as due_at
    ) occurrence
    where s.next_refresh_at <= v_now
      and not exists (select 1 from public.replan_jobs j where j.user_id = s.user_id
        and j.kind = 'refresh' and j.status in ('pending', 'running'))
      -- Filter duplicates BEFORE LIMIT so terminal occurrences cannot consume every slot.
      and not exists (select 1 from public.replan_jobs j where j.user_id = s.user_id
        and j.kind = 'refresh' and j.scheduled_for = occurrence.due_at)
      and not exists (select 1 from public.replan_jobs j where j.user_id = s.user_id
        and j.deduplication_key = 'refresh:' || extract(epoch from occurrence.due_at)::text)
    order by s.next_refresh_at, s.user_id limit p_limit for update of s skip locked
  loop
    insert into public.replan_jobs(user_id, kind, reason, deduplication_key, scheduled_for)
    values(v_candidate.user_id, 'refresh', 'scheduled refresh',
      'refresh:' || extract(epoch from v_candidate.due_at)::text, v_candidate.due_at)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

create index replan_jobs_user_live_idx on public.replan_jobs(user_id, available_at, id)
where status in ('pending', 'running');

create or replace function public.claim_replan_job(p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_user_id uuid; v_job public.replan_jobs; v_schedule public.planning_schedules;
  v_now timestamptz := clock_timestamp();
  v_today date; v_timezone text; v_from date; v_through date; v_horizon date;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise sqlstate 'PT400' using message = 'lease must be between 30 and 3600 seconds';
  end if;
  -- Start from ready jobs, not every athlete; keep schedule-first lock ordering.
  for v_user_id in
    select ready.user_id from (
      select user_id, available_at from public.replan_jobs
      where status = 'pending' and available_at <= v_now
      union all
      select user_id, available_at from public.replan_jobs
      where status = 'running' and lease_expires_at <= v_now
    ) ready
    where not exists (select 1 from public.replan_jobs j where j.user_id = ready.user_id
      and j.status = 'running' and j.lease_expires_at > v_now)
    group by ready.user_id order by min(ready.available_at), ready.user_id
  loop
    select * into v_schedule from public.planning_schedules
    where user_id = v_user_id for update skip locked;
    exit when found;
  end loop;
  if v_schedule.user_id is null then return null; end if;
  -- Lock/recheck a running job first, including a concurrently renewed lease.
  select * into v_job from public.replan_jobs where user_id = v_user_id
    and (status = 'running' or (status = 'pending' and available_at <= v_now))
  order by (status = 'running') desc, available_at, id limit 1 for update;
  if not found or (v_job.status = 'running' and v_job.lease_expires_at > clock_timestamp()) then
    return null;
  end if;
  if v_job.attempts >= 5 then
    update public.replan_jobs set status = 'failed', error = 'attempt limit reached',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = v_job.id;
    return null;
  end if;
  select timezone into v_timezone from public.profiles where id = v_user_id;
  v_today := (clock_timestamp() at time zone v_timezone)::date;
  if v_job.kind = 'adjustment' then
    v_from := greatest(v_today, v_job.effective_from);
    v_through := least(v_job.effective_through, v_schedule.horizon_end);
    v_horizon := v_schedule.horizon_end;
  else
    v_from := v_today;
    v_horizon := greatest(v_schedule.horizon_end,
      (v_job.scheduled_for at time zone v_timezone)::date + v_schedule.horizon_days - 1);
    v_through := v_horizon;
  end if;
  if v_horizon is null or v_from > v_through then
    update public.replan_jobs set status = 'cancelled', error = 'planning window expired',
      completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null where id = v_job.id;
    return null;
  end if;
  update public.replan_jobs set status = 'running', attempts = attempts + 1,
    expected_revision = v_schedule.revision, lease_token = gen_random_uuid(),
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), error = null
  where id = v_job.id returning * into v_job;
  return jsonb_build_object('job', to_jsonb(v_job), 'effective_from', v_from,
    'effective_through', v_through, 'horizon_end', v_horizon);
end;
$$;

-- Users can read their history and insert only their own human messages.
-- Message identity/timestamps and all assistant writes belong to the backend.
drop policy messages_owner_policy on public.messages;
create policy messages_owner_read on public.messages
for select to authenticated using (user_id = (select auth.uid()));
create policy messages_owner_insert on public.messages
for insert to authenticated with check (user_id = (select auth.uid()) and role = 'user');
revoke insert, update, delete on public.messages from authenticated;
grant insert (user_id, role, content) on public.messages to authenticated;
grant select, insert on public.messages to service_role;

notify pgrst, 'reload schema';
