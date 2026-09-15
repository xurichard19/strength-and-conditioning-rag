-- Owners can rename and delete threads, but cannot change ownership or timestamps.
alter table public.conversations add constraint conversations_title_check
  check (char_length(btrim(title)) between 1 and 120);
create policy conversations_owner_update on public.conversations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conversations_owner_delete on public.conversations for delete to authenticated
  using (user_id = auth.uid());
grant update (title), delete on public.conversations to authenticated;

-- Only new default titles change; existing and custom titles are preserved.
create or replace function public.ensure_message_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' and new.user_id is distinct from auth.uid() then
    raise exception 'conversation owner mismatch' using errcode = '42501';
  end if;
  if new.role = 'user' then
    insert into public.conversations(id, user_id, title, created_at)
    select new.conversation_id, new.user_id,
      to_char(new.created_at at time zone p.timezone, 'YYYY-MM-DD HH24:MI'), new.created_at
    from public.profiles p where p.id = new.user_id
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_message_conversation() from public, anon, authenticated;
