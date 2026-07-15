revoke all privileges on table public.profiles from anon;

revoke all privileges on table public.profiles from authenticated;
grant select, insert, update on table public.profiles to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

alter function public.set_updated_at() set search_path = pg_catalog;
