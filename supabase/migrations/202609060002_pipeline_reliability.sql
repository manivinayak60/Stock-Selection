begin;

alter table public.pipeline_control add column if not exists lease_token uuid;

alter table public.paper_trades
  add column if not exists signal_score numeric(7, 2),
  add column if not exists signal_status text,
  add column if not exists signal_market_date date,
  add column if not exists evidence_status text,
  add column if not exists exit_reason text;

create table if not exists public.pipeline_events (
  id bigint generated always as identity primary key,
  level text not null check (level in ('INFO', 'WARNING', 'ERROR')),
  stage text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pipeline_events_created_idx on public.pipeline_events (created_at desc);
alter table public.pipeline_events enable row level security;
drop policy if exists "Authenticated users read pipeline events" on public.pipeline_events;
create policy "Authenticated users read pipeline events" on public.pipeline_events
  for select to authenticated using (true);
grant select on public.pipeline_events to authenticated;

create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, bucket)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_private_rate_limit(
  p_user_id uuid, p_bucket text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_allowed boolean;
begin
  insert into public.api_rate_limits (user_id, bucket, window_started_at, request_count)
  values (p_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    window_started_at = case
      when public.api_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds)
      then now() else public.api_rate_limits.window_started_at end,
    request_count = case
      when public.api_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds)
      then 1 else public.api_rate_limits.request_count + 1 end
  returning request_count <= p_limit into v_allowed;
  return v_allowed;
end;
$fn$;
revoke all on function public.consume_private_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_private_rate_limit(uuid, text, integer, integer) to service_role;

create or replace function public.get_swing_signal_database_bytes()
returns bigint language sql security definer set search_path = public as $fn$
  select pg_database_size(current_database());
$fn$;
revoke all on function public.get_swing_signal_database_bytes() from public, anon, authenticated;
grant execute on function public.get_swing_signal_database_bytes() to service_role;

drop function if exists public.acquire_swing_signal_pipeline_lease();
create function public.acquire_swing_signal_pipeline_lease()
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_token uuid := gen_random_uuid(); v_acquired uuid;
begin
  update public.pipeline_control
  set lease_until = now() + interval '15 minutes', lease_token = v_token, updated_at = now()
  where id = true and (lease_until is null or lease_until < now())
  returning lease_token into v_acquired;
  return v_acquired;
end;
$fn$;

drop function if exists public.release_swing_signal_pipeline_lease(boolean);
create function public.release_swing_signal_pipeline_lease(p_lease_token uuid, p_completed boolean)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  update public.pipeline_control
  set lease_until = null, lease_token = null,
      last_completed_at = case when p_completed then now() else last_completed_at end,
      updated_at = now()
  where id = true and lease_token = p_lease_token;
end;
$fn$;

create or replace function public.publish_swing_signal_scan(p_run jsonb, p_candidates jsonb)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_run_id uuid;
begin
  insert into public.market_scan_runs (
    market_date, provider, status, market_regime, universe_count, received_count,
    validated_count, qualified_count, failed_count, source, warnings, missing_symbols,
    error_message, started_at, completed_at
  ) values (
    (p_run->>'market_date')::date, p_run->>'provider', p_run->>'status',
    p_run->>'market_regime', (p_run->>'universe_count')::integer,
    (p_run->>'received_count')::integer, (p_run->>'validated_count')::integer,
    (p_run->>'qualified_count')::integer, (p_run->>'failed_count')::integer,
    p_run->>'source', coalesce(p_run->'warnings', '[]'::jsonb),
    coalesce(p_run->'missing_symbols', '[]'::jsonb), nullif(p_run->>'error_message', ''),
    (p_run->>'started_at')::timestamptz, (p_run->>'completed_at')::timestamptz
  )
  on conflict (market_date, provider) do update set
    status = excluded.status, market_regime = excluded.market_regime,
    universe_count = excluded.universe_count, received_count = excluded.received_count,
    validated_count = excluded.validated_count, qualified_count = excluded.qualified_count,
    failed_count = excluded.failed_count, source = excluded.source, warnings = excluded.warnings,
    missing_symbols = excluded.missing_symbols, error_message = excluded.error_message,
    started_at = excluded.started_at, completed_at = excluded.completed_at
  returning id into v_run_id;

  delete from public.market_scan_candidates where run_id = v_run_id;
  insert into public.market_scan_candidates (run_id, symbol, sector, status, score, payload)
  select v_run_id, item.symbol, item.sector, item.status, item.score, item.payload
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as item(
    symbol varchar(20), sector text, status text, score numeric, payload jsonb
  );
  return v_run_id;
end;
$fn$;

revoke all on function public.acquire_swing_signal_pipeline_lease() from public, anon, authenticated;
revoke all on function public.release_swing_signal_pipeline_lease(uuid, boolean) from public, anon, authenticated;
revoke all on function public.publish_swing_signal_scan(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.acquire_swing_signal_pipeline_lease() to service_role;
grant execute on function public.release_swing_signal_pipeline_lease(uuid, boolean) to service_role;
grant execute on function public.publish_swing_signal_scan(jsonb, jsonb) to service_role;

create or replace function public.prune_swing_signal_history()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.market_scan_runs where market_date < current_date - 90;
  delete from public.eod_prices where market_date < current_date - interval '3 years';
  delete from public.benchmark_prices where market_date < current_date - interval '3 years';
  delete from public.pipeline_events where created_at < now() - interval '90 days';
end;
$fn$;

commit;
