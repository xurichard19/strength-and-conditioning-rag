-- Completing onboarding and enabling initial planning must commit together.
create function public.complete_onboarding(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_response public.onboarding_responses;
begin
  update public.onboarding_responses
  set completed_at = coalesce(completed_at, clock_timestamp())
  where user_id = p_user_id returning * into v_response;
  if not found then return null; end if;
  -- Existing schedules retain their coverage and cadence, including on repeated completion.
  insert into public.planning_schedules(user_id, next_refresh_at)
  values(p_user_id, clock_timestamp()) on conflict (user_id) do nothing;
  return to_jsonb(v_response);
end;
$$;
revoke all on function public.complete_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.complete_onboarding(uuid) to service_role;

notify pgrst, 'reload schema';
