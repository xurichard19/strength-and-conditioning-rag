-- Signup metadata is untrusted: only accept a timezone PostgreSQL recognizes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, timezone)
  values (new.id, new.email, coalesce(
    (select name from pg_catalog.pg_timezone_names
      where name = new.raw_user_meta_data ->> 'timezone' limit 1), 'UTC'))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
