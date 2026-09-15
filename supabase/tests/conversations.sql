-- Run after the migrations in a disposable database only.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
('11111111-1111-4111-8111-111111111111', 'chat-a@test.invalid', '{"timezone":"America/New_York"}'),
('22222222-2222-4222-8222-222222222222', 'chat-b@test.invalid', '{}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.messages(user_id, conversation_id, role, content) values
('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user', 'first'),
('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user', 'second');
do $$ begin
  if (select count(*) from public.conversations) <> 1 then raise exception 'expected one thread'; end if;
  if (select title from public.conversations) <> to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')
    then raise exception 'wrong title timezone'; end if;
  update public.conversations set title = 'My training questions';
  begin
    update public.conversations set title = repeat(' ', 121) || 'name';
    raise exception 'oversized padded title allowed';
  exception when check_violation then null;
  end;
  if (select title from public.conversations) <> 'My training questions' then raise exception 'rename failed'; end if;
  begin
    update public.conversations set user_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'ownership edit allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages(user_id, conversation_id, role, content) values
    ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assistant', 'forged');
    raise exception 'assistant forgery allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ begin
  if exists(select 1 from public.conversations) then raise exception 'cross-user read'; end if;
  update public.conversations set title = 'Hijacked';
  if found then raise exception 'cross-user rename'; end if;
  delete from public.conversations;
  if found then raise exception 'cross-user delete'; end if;
  begin
    insert into public.messages(user_id, conversation_id, role, content) values
    ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user', 'foreign thread');
    raise exception 'cross-user write';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into public.messages(user_id, conversation_id, role, content) values
('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assistant', 'trusted reply');
reset role;
do $$ begin
  if (select count(*) from public.messages where conversation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 3
    then raise exception 'expected two human messages and one assistant reply'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
delete from public.conversations where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
reset role;
do $$ begin
  if exists(select 1 from public.messages where conversation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    then raise exception 'conversation delete did not cascade'; end if;
end $$;
rollback;
