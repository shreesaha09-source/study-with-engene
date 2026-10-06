-- STUDYVERSE PUBLIC STATS PATCH
-- Keep get_public_reach() as your unique visitor/reached counter.
-- Add a separate function for registered ENGENEs.
-- Add a separate function for total visit hits.

create or replace function public.get_public_registered_count()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from auth.users;
$$;

revoke all on function public.get_public_registered_count() from public;
grant execute on function public.get_public_registered_count() to anon, authenticated;

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
