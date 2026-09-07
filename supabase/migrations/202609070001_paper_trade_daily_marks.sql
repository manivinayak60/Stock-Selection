begin;

alter table public.paper_trades
  add column if not exists entry_market_date date;

update public.paper_trades
set entry_market_date = (opened_at at time zone 'Asia/Kolkata')::date
where entry_market_date is null;

alter table public.paper_trades
  alter column entry_market_date set default ((now() at time zone 'Asia/Kolkata')::date),
  alter column entry_market_date set not null;

create table if not exists public.paper_trade_daily_marks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_trade_id bigint not null references public.paper_trades(id) on delete cascade,
  symbol varchar(20) not null check (symbol ~ '^[A-Z0-9&.-]{1,20}$'),
  market_date date not null,
  open numeric(14, 2) not null check (open > 0),
  high numeric(14, 2) not null check (high > 0),
  low numeric(14, 2) not null check (low > 0),
  close numeric(14, 2) not null check (close > 0),
  source text not null default 'NSE_EOD' check (source = 'NSE_EOD'),
  recorded_at timestamptz not null default now(),
  unique (paper_trade_id, market_date),
  check (low <= high and open between low and high and close between low and high)
);

create index if not exists paper_trade_marks_user_trade_date_idx
  on public.paper_trade_daily_marks (user_id, paper_trade_id, market_date);

alter table public.paper_trade_daily_marks enable row level security;
do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'paper_trade_daily_marks'
      and policyname = 'Users read own paper trade marks'
  ) then
    create policy "Users read own paper trade marks" on public.paper_trade_daily_marks
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end;
$policy$;

grant select on public.paper_trade_daily_marks to authenticated;

commit;
