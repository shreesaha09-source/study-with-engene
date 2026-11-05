create table public.community_announcement_likes (
  announcement_id uuid not null references public.community_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.community_announcement_likes enable row level security;
grant select, insert, delete on table public.community_announcement_likes to authenticated, service_role;
create policy "Users see their own announcement likes"
  on public.community_announcement_likes
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users like announcements for themselves"
  on public.community_announcement_likes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users remove their own announcement likes"
  on public.community_announcement_likes
  for delete to authenticated
  using ((select auth.uid()) = user_id);
