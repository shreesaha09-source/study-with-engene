alter table public.community_art
  add column if not exists creator_name text not null default 'Community artist'
    check (char_length(creator_name) between 1 and 40),
  add column if not exists license_accepted_at timestamptz;

comment on column public.community_art.creator_name is
  'Creator-chosen public credit name or pseudonym; never an email address.';
comment on column public.community_art.license_accepted_at is
  'Timestamp when uploader confirmed they own or may share the work and granted the limited display/share license.';
