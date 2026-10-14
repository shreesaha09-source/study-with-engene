create table if not exists public.study_ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.study_ai_usage enable row level security;
revoke all on table public.study_ai_usage from anon, authenticated;

create or replace function public.consume_study_ai_quota(p_max_requests integer default 12)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  insert into public.study_ai_usage as usage (user_id, window_started_at, request_count)
  values (v_user_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when usage.window_started_at <= now() - interval '1 minute' then now()
        else usage.window_started_at
      end,
      request_count = case
        when usage.window_started_at <= now() - interval '1 minute' then 1
        else usage.request_count + 1
      end
  returning request_count into v_count;

  return v_count <= least(greatest(coalesce(p_max_requests, 12), 1), 30);
end;
$$;

revoke all on function public.consume_study_ai_quota(integer) from public, anon;
grant execute on function public.consume_study_ai_quota(integer) to authenticated;
