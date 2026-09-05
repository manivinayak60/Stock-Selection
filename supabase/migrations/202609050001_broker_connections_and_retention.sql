begin;

alter table public.settings drop constraint if exists settings_provider_check;
alter table public.settings add constraint settings_provider_check
  check (provider in ('FREE_EOD', 'KITE_CONNECT', 'GROWW_CONNECT'));

alter table public.scan_runs drop constraint if exists scan_runs_provider_check;
alter table public.scan_runs add constraint scan_runs_provider_check
  check (provider in ('FREE_EOD', 'KITE_CONNECT', 'GROWW_CONNECT'));

create table if not exists public.broker_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('KITE_CONNECT', 'GROWW_CONNECT')),
  account_id text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  status text not null default 'CONNECTED'
    check (status in ('CONNECTED', 'EXPIRED', 'ERROR')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.broker_connections enable row level security;
revoke all on public.broker_connections from anon, authenticated;

create or replace function public.prune_swing_signal_history()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.market_scan_runs
    where market_date < current_date - 90;
  delete from public.eod_prices
    where market_date < current_date - interval '3 years';
  delete from public.benchmark_prices
    where market_date < current_date - interval '3 years';
end;
$$;

revoke all on function public.prune_swing_signal_history() from public, anon, authenticated;
grant execute on function public.prune_swing_signal_history() to service_role;

commit;
