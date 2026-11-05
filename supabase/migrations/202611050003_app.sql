begin;
create function public.global_admin_status() returns boolean language sql stable security definer set search_path=''
as $$ select private.is_super() $$;
revoke execute on function public.global_admin_status() from public,anon,authenticated;
grant execute on function public.global_admin_status() to authenticated;
-- Prevent all future automatically generated public tables from inheriting default client writes.
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke all on sequences from anon,authenticated;
commit;
