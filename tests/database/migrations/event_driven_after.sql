do $$
begin
  if not exists(select 1 from public.planning_schedules
    where user_id = '73737373-7373-4373-8373-737373737373'
      and billing_wake_token is not null and billing_recheck_at <= clock_timestamp()) then
    raise exception 'forward migration did not wake the existing paused account once';
  end if;
  if to_regprocedure('public.defer_planning(uuid,text,integer)') is null
    or to_regprocedure('public.resume_planning(uuid,text,bigint)') is null
    or to_regprocedure('public.list_planning_billing_rechecks(integer)') is null then
    raise exception 'forward migration removed a draining service RPC';
  end if;
end;
$$;
delete from auth.users where id = '73737373-7373-4373-8373-737373737373';
