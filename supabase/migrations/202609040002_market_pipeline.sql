begin;

update public.settings set provider = 'KITE_CONNECT' where provider = 'KITE';
update public.scan_runs set provider = 'KITE_CONNECT' where provider = 'KITE';

alter table public.settings drop constraint if exists settings_provider_check;
alter table public.settings add constraint settings_provider_check
  check (provider in ('FREE_EOD', 'KITE_CONNECT'));
alter table public.scan_runs drop constraint if exists scan_runs_provider_check;
alter table public.scan_runs add constraint scan_runs_provider_check
  check (provider in ('FREE_EOD', 'KITE_CONNECT'));

alter table public.paper_trades
  add column if not exists sector text not null default 'Unknown';

create table if not exists public.instruments (
  symbol varchar(20) primary key,
  company_name text not null,
  industry text not null,
  series varchar(4) not null default 'EQ',
  isin varchar(16) not null,
  is_bank boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.eod_prices (
  symbol varchar(20) not null,
  market_date date not null,
  open numeric(14, 2) not null,
  high numeric(14, 2) not null,
  low numeric(14, 2) not null,
  close numeric(14, 2) not null,
  volume bigint not null,
  turnover_lacs numeric(18, 2) not null,
  trades bigint,
  delivery_percent numeric(7, 2),
  source text not null default 'NSE_SEC_BHAVDATA_FULL',
  ingested_at timestamptz not null default now(),
  primary key (symbol, market_date)
);

create index if not exists eod_prices_market_date_idx
  on public.eod_prices (market_date desc);

create table if not exists public.benchmark_prices (
  symbol varchar(32) not null,
  market_date date not null,
  open numeric(14, 2) not null,
  high numeric(14, 2) not null,
  low numeric(14, 2) not null,
  close numeric(14, 2) not null,
  volume bigint,
  source text not null default 'NSE_INDEX_SNAPSHOT',
  ingested_at timestamptz not null default now(),
  primary key (symbol, market_date)
);

create table if not exists public.indicator_states (
  symbol varchar(32) primary key,
  as_of_date date not null,
  candles jsonb not null,
  bar_count integer not null check (bar_count > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.fundamentals (
  symbol varchar(20) primary key references public.instruments(symbol) on delete cascade,
  as_of_date date not null,
  market_cap_cr numeric(16, 2) not null check (market_cap_cr > 0),
  debt_equity numeric(10, 4),
  opm numeric(10, 4),
  roe numeric(10, 4),
  sales_growth numeric(10, 4),
  capital_adequacy numeric(10, 4),
  gross_npa numeric(10, 4),
  net_npa numeric(10, 4),
  source_name text not null,
  source_url text,
  imported_at timestamptz not null default now()
);

create table if not exists public.market_scan_runs (
  id uuid primary key default gen_random_uuid(),
  market_date date not null,
  provider text not null default 'FREE_EOD' check (provider in ('FREE_EOD', 'KITE_CONNECT')),
  status text not null check (status in ('RUNNING', 'COMPLETED', 'FAILED', 'INSUFFICIENT_HISTORY')),
  market_regime text not null default 'Unknown',
  universe_count integer not null default 0,
  received_count integer not null default 0,
  validated_count integer not null default 0,
  qualified_count integer not null default 0,
  failed_count integer not null default 0,
  source text not null,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (market_date, provider)
);

create index if not exists market_scan_runs_completed_idx
  on public.market_scan_runs (market_date desc, completed_at desc)
  where status = 'COMPLETED';

create table if not exists public.market_scan_candidates (
  run_id uuid not null references public.market_scan_runs(id) on delete cascade,
  symbol varchar(20) not null references public.instruments(symbol) on delete cascade,
  sector text not null,
  status text not null check (status in ('Strong', 'Qualified', 'Watch')),
  score numeric(7, 2) not null,
  payload jsonb not null,
  primary key (run_id, symbol)
);

create index if not exists market_scan_candidates_rank_idx
  on public.market_scan_candidates (run_id, score desc);

alter table public.instruments enable row level security;
alter table public.eod_prices enable row level security;
alter table public.benchmark_prices enable row level security;
alter table public.indicator_states enable row level security;
alter table public.fundamentals enable row level security;
alter table public.market_scan_runs enable row level security;
alter table public.market_scan_candidates enable row level security;

drop policy if exists "Authenticated users read instruments" on public.instruments;
create policy "Authenticated users read instruments" on public.instruments
  for select to authenticated using (true);
drop policy if exists "Authenticated users read fundamentals" on public.fundamentals;
create policy "Authenticated users read fundamentals" on public.fundamentals
  for select to authenticated using (true);
drop policy if exists "Authenticated users read market runs" on public.market_scan_runs;
create policy "Authenticated users read market runs" on public.market_scan_runs
  for select to authenticated using (true);
drop policy if exists "Authenticated users read candidates" on public.market_scan_candidates;
create policy "Authenticated users read candidates" on public.market_scan_candidates
  for select to authenticated using (true);

grant select on public.instruments, public.fundamentals,
  public.market_scan_runs, public.market_scan_candidates to authenticated;

create or replace function public.create_paper_trade_atomic(
  p_symbol text,
  p_sector text,
  p_setup text,
  p_entry numeric,
  p_stop numeric,
  p_target numeric,
  p_quantity integer,
  p_notes text default ''
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.settings%rowtype;
  v_positions integer;
  v_open_risk numeric;
  v_invested numeric;
  v_sector_invested numeric;
  v_trade_risk numeric;
  v_trade_value numeric;
  v_id bigint;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_entry <= p_stop or p_target <= p_entry or p_quantity < 1 then
    raise exception 'Invalid trade plan';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_settings from public.settings where user_id = v_user_id;
  if not found then
    insert into public.settings (user_id, updated_at) values (v_user_id, now())
      returning * into v_settings;
  end if;

  select count(*), coalesce(sum((entry - stop) * quantity), 0),
         coalesce(sum(entry * quantity), 0),
         coalesce(sum(entry * quantity) filter (where sector = p_sector), 0)
    into v_positions, v_open_risk, v_invested, v_sector_invested
    from public.paper_trades
    where user_id = v_user_id and status = 'OPEN';

  if exists (
    select 1 from public.paper_trades
    where user_id = v_user_id and status = 'OPEN' and symbol = upper(p_symbol)
  ) then raise exception 'An open paper trade already exists for this symbol'; end if;

  v_trade_risk := (p_entry - p_stop) * p_quantity;
  v_trade_value := p_entry * p_quantity;
  if v_trade_risk > v_settings.per_stock_risk then
    raise exception 'Per-stock risk limit would be exceeded';
  end if;
  if v_open_risk + v_trade_risk > v_settings.hard_risk then
    raise exception 'Hard open-risk limit would be exceeded';
  end if;
  if v_positions >= v_settings.max_positions then
    raise exception 'Maximum open positions reached';
  end if;
  if v_invested + v_trade_value > v_settings.capital then
    raise exception 'Available capital would be exceeded';
  end if;
  if v_sector_invested + v_trade_value >
     v_settings.capital * v_settings.max_sector_allocation / 100 then
    raise exception 'Sector allocation limit would be exceeded';
  end if;

  insert into public.paper_trades
    (user_id, symbol, sector, setup, status, entry, stop, target, quantity, opened_at, notes)
  values
    (v_user_id, upper(p_symbol), p_sector, p_setup, 'OPEN', p_entry, p_stop,
     p_target, p_quantity, now(), coalesce(p_notes, ''))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_paper_trade_atomic(
  text, text, text, numeric, numeric, numeric, integer, text
) to authenticated;

commit;
