do $$
declare v_helper regprocedure := to_regprocedure(
  'public.latest_refresh_occurrence(timestamptz, integer, text, timestamptz)');
begin
  if v_helper is null then raise exception 'refresh helper was not restored'; end if;
  if not has_function_privilege('service_role', v_helper, 'execute')
    or has_function_privilege('anon', v_helper, 'execute')
    or has_function_privilege('authenticated', v_helper, 'execute') then
    raise exception 'refresh helper permissions are not service-only';
  end if;
  if public.latest_refresh_occurrence('2026-03-01 14:00Z', 7, 'America/New_York', '2026-03-08 14:00Z')
    <> '2026-03-08 13:00Z'::timestamptz then
    raise exception 'restored helper changed spring daylight-saving cadence';
  end if;
  if public.latest_refresh_occurrence('2026-10-25 13:00Z', 7, 'America/New_York', '2026-11-01 15:00Z')
    <> '2026-11-01 14:00Z'::timestamptz then
    raise exception 'restored helper changed fall daylight-saving cadence';
  end if;
  perform public.enqueue_due_replans(1, true);
end;
$$;
