-- Anonymous query rate limiting + daily budget tracking.
-- Per-IP daily request counter; budget cap reuses usage_records (where user_id is null).

create table if not exists public.anon_usage (
  ip_hash text not null,
  day date not null,
  request_count integer not null default 0,
  first_request_at timestamptz not null default now(),
  last_request_at timestamptz not null default now(),
  primary key (ip_hash, day)
);

create index if not exists idx_anon_usage_day on public.anon_usage(day);

alter table public.anon_usage enable row level security;
-- No policies: only service_role bypasses RLS, no other access.

-- Atomically check the per-IP daily count and increment when under limit.
-- Returns (new_count, allowed). When allowed=false, count is unchanged.
create or replace function public.check_and_increment_anon_request(
  p_ip_hash text,
  p_day date,
  p_limit integer
) returns table (new_count integer, allowed boolean)
language plpgsql
as $$
declare
  v_count integer;
begin
  select coalesce(request_count, 0)
    into v_count
    from public.anon_usage
   where ip_hash = p_ip_hash and day = p_day
   for update;

  v_count := coalesce(v_count, 0);

  if v_count >= p_limit then
    return query select v_count, false;
    return;
  end if;

  insert into public.anon_usage (ip_hash, day, request_count)
  values (p_ip_hash, p_day, 1)
  on conflict (ip_hash, day) do update
    set request_count = anon_usage.request_count + 1,
        last_request_at = now()
  returning anon_usage.request_count into v_count;

  return query select v_count, true;
end;
$$;

-- Sum anonymous spend for a UTC day (uses usage_records.user_id is null).
create or replace function public.get_anon_daily_spend(p_day date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(cost_dollars), 0)::numeric
    from public.usage_records
   where user_id is null
     and created_at >= p_day::timestamptz
     and created_at <  (p_day + interval '1 day')::timestamptz;
$$;
