-- Public Studyverse reach counter.
-- Run this once in Supabase -> SQL Editor if get_public_visit_count() does not exist yet.
create or replace function public.get_public_visit_count()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.site_visits;
$$;

revoke all on function public.get_public_visit_count() from public;
grant execute on function public.get_public_visit_count() to anon, authenticated;
