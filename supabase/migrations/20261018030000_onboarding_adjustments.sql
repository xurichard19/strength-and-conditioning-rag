-- A completed athlete saving changed setup answers requests an adjustment atomically.
create function public.replan_after_onboarding_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid; v_schedule public.planning_schedules; v_today date;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise sqlstate 'PT400' using message = 'onboarding owner cannot change';
    end if;
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then return null; end if;
  end if;
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  update public.planning_schedules set revision = revision + 1 where user_id = v_user
  returning * into v_schedule;
  if not found or tg_op <> 'UPDATE' or old.completed_at is null
    or new.answers is not distinct from old.answers or v_schedule.horizon_end is null then return null; end if;
  select (clock_timestamp() at time zone timezone)::date into v_today from public.profiles where id = v_user;
  if not found or v_schedule.horizon_end < v_today then return null; end if;
  insert into public.replan_jobs(user_id, kind, reason, deduplication_key, effective_from, effective_through)
  values(v_user, 'adjustment', 'onboarding answers changed',
    'onboarding:' || v_schedule.revision::text, v_today, v_schedule.horizon_end);
  return null;
end;
$$;
drop trigger onboarding_planning_revision on public.onboarding_responses;
create trigger onboarding_planning_revision after insert or update or delete on public.onboarding_responses
for each row execute function public.replan_after_onboarding_change();
revoke all on function public.replan_after_onboarding_change() from public, anon, authenticated;

notify pgrst, 'reload schema';
