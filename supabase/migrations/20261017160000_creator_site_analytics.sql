create table if not exists public.site_analytics_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  event_type text not null check (event_type in ('page_view', 'page_end')),
  page text not null check (char_length(page) between 1 and 80),
  source text not null check (char_length(source) between 1 and 120),
  occurred_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400)
);

create index if not exists site_analytics_events_occurred_at_idx
  on public.site_analytics_events (occurred_at desc);
create index if not exists site_analytics_events_session_idx
  on public.site_analytics_events (session_id, occurred_at);

alter table public.site_analytics_events enable row level security;
revoke all on public.site_analytics_events from anon, authenticated;

