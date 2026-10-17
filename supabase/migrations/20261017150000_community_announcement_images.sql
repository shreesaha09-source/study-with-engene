alter table public.community_announcements
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'community-announcements',
  'community-announcements',
  true,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

