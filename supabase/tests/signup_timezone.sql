begin;
do $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values(v_id, 'timezone@example.invalid', '{"timezone":"America/New_York"}');
  assert (select timezone from public.profiles where id = v_id) = 'America/New_York';
  delete from auth.users where id = v_id;

  insert into auth.users(id, email, raw_user_meta_data)
  values(v_id, 'timezone@example.invalid', '{"timezone":"invalid/timezone"}');
  assert (select timezone from public.profiles where id = v_id) = 'UTC';
  delete from auth.users where id = v_id;

  insert into auth.users(id, email) values(v_id, 'timezone@example.invalid');
  assert (select timezone from public.profiles where id = v_id) = 'UTC';
end;
$$;
rollback;
