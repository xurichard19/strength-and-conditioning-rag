-- Name new conversations after their first human message; never overwrite existing titles.
create or replace function public.ensure_message_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  if auth.role() <> 'service_role' and new.user_id is distinct from auth.uid() then
    raise exception 'conversation owner mismatch' using errcode = '42501';
  end if;
  if new.role = 'user' then
    v_title := btrim(regexp_replace(new.content, '[[:space:]]+', ' ', 'g'));
    if char_length(v_title) > 120 then
      v_title := left(v_title, 119) || '…';
    end if;
    insert into public.conversations(id, user_id, title, created_at)
    select new.conversation_id, new.user_id, v_title, new.created_at
    from public.profiles p where p.id = new.user_id
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_message_conversation() from public, anon, authenticated;
