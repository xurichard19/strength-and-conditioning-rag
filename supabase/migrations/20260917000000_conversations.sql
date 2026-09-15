-- Preserve existing history as one conversation per user.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
alter table public.conversations enable row level security;
create policy conversations_owner_read on public.conversations for select to authenticated using (user_id = auth.uid());
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
grant all on public.conversations to service_role;
create index conversations_owner_date_idx on public.conversations(user_id, created_at desc, id desc);
alter table public.messages add column conversation_id uuid;
insert into public.conversations(user_id, title, created_at)
select m.user_id, to_char(min(m.created_at) at time zone p.timezone, 'YYYY-MM-DD'), min(m.created_at)
from public.messages m join public.profiles p on p.id = m.user_id group by m.user_id, p.timezone;
update public.messages m set conversation_id = c.id from public.conversations c where c.user_id = m.user_id;
alter table public.messages alter column conversation_id set not null;
alter table public.messages add constraint messages_conversation_owner_fk
foreign key (conversation_id, user_id) references public.conversations(id, user_id) on delete cascade;
create index messages_conversation_date_idx on public.messages(conversation_id, created_at desc, id desc);
grant insert (conversation_id) on public.messages to authenticated;

-- First human insert creates its conversation atomically; clients cannot set titles or owners.
create function public.ensure_message_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' and new.user_id is distinct from auth.uid() then
    raise exception 'conversation owner mismatch' using errcode = '42501';
  end if;
  if new.role = 'user' then
    insert into public.conversations(id, user_id, title, created_at)
    select new.conversation_id, new.user_id,
      to_char(new.created_at at time zone p.timezone, 'YYYY-MM-DD'), new.created_at
    from public.profiles p where p.id = new.user_id
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_message_conversation() from public, anon, authenticated;
create trigger ensure_message_conversation before insert on public.messages
for each row execute function public.ensure_message_conversation();
