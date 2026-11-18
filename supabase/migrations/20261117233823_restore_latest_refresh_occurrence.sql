-- the helper was added to an already-applied migration, so existing databases
-- can lack it even though clean installations and migration history look current.
-- keep this definition aligned with the original local-time cadence arithmetic.
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
grant execute on function public.latest_refresh_occurrence(timestamptz, integer, text, timestamptz)
to service_role;

notify pgrst, 'reload schema';
