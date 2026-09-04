begin;

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  capital numeric(14, 2) not null default 50000 check (capital > 0),
  normal_risk numeric(14, 2) not null default 5000 check (normal_risk > 0),
  hard_risk numeric(14, 2) not null default 8000 check (hard_risk >= normal_risk),
  per_stock_risk numeric(14, 2) not null default 2000 check (per_stock_risk > 0),
  max_positions integer not null default 5 check (max_positions between 1 and 25),
  max_sector_allocation numeric(5, 2) not null default 35 check (max_sector_allocation > 0 and max_sector_allocation <= 100),
  provider text not null default 'FREE_EOD' check (provider in ('FREE_EOD', 'KITE')),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlist (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol varchar(20) not null check (symbol ~ '^[A-Z0-9&.-]{1,20}$'),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.paper_trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol varchar(20) not null check (symbol ~ '^[A-Z0-9&.-]{1,20}$'),
  setup text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  entry numeric(14, 2) not null check (entry > 0),
  stop numeric(14, 2) not null check (stop > 0 and stop < entry),
  target numeric(14, 2) not null check (target > entry),
  quantity integer not null check (quantity > 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  exit_price numeric(14, 2) check (exit_price is null or exit_price > 0),
  notes text not null default '',
  check (
    (status = 'OPEN' and closed_at is null and exit_price is null)
    or (status = 'CLOSED' and closed_at is not null and exit_price is not null)
  )
);

create table if not exists public.scan_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  market_date date not null,
  provider text not null check (provider in ('FREE_EOD', 'KITE')),
  status text not null default 'COMPLETED' check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  universe_count integer not null check (universe_count >= 0),
  qualified_count integer not null check (qualified_count >= 0 and qualified_count <= universe_count),
  created_at timestamptz not null default now()
);

create index if not exists watchlist_user_created_idx
  on public.watchlist (user_id, created_at desc);
create index if not exists paper_trades_user_status_idx
  on public.paper_trades (user_id, status, opened_at desc);
create index if not exists scan_runs_user_created_idx
  on public.scan_runs (user_id, created_at desc);

alter table public.settings enable row level security;
alter table public.watchlist enable row level security;
alter table public.paper_trades enable row level security;
alter table public.scan_runs enable row level security;

drop policy if exists "Users manage own settings" on public.settings;
create policy "Users manage own settings" on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own watchlist" on public.watchlist;
create policy "Users manage own watchlist" on public.watchlist
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own paper trades" on public.paper_trades;
create policy "Users manage own paper trades" on public.paper_trades
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own scan runs" on public.scan_runs;
create policy "Users manage own scan runs" on public.scan_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.watchlist to authenticated;
grant select, insert, update, delete on public.paper_trades to authenticated;
grant select, insert, update, delete on public.scan_runs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
