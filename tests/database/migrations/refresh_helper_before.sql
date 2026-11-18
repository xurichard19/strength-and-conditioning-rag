-- reproduce an existing database whose recorded migration predates this helper.
drop function public.latest_refresh_occurrence(timestamptz, integer, text, timestamptz);

do $$
begin
  begin
    perform public.enqueue_due_replans(1, true);
    raise exception 'missing helper did not reproduce the scheduler failure';
  exception when undefined_function then
    null;
  end;
end;
$$;
