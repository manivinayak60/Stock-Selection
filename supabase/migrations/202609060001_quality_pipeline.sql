begin;

alter table public.settings
  add column if not exists screener_url text;

alter table public.instruments
  add column if not exists is_nbfc boolean not null default false;

alter table public.fundamentals
  drop constraint if exists fundamentals_pkey;
alter table public.fundamentals
  add primary key (symbol, as_of_date);
create index if not exists fundamentals_latest_idx
  on public.fundamentals (symbol, as_of_date desc);

alter table public.market_scan_runs
  add column if not exists missing_symbols jsonb not null default '[]'::jsonb;

create table if not exists public.pipeline_control (
  id boolean primary key default true check (id),
  lease_until timestamptz,
  last_completed_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.pipeline_control (id) values (true)
on conflict (id) do nothing;

alter table public.pipeline_control enable row level security;
revoke all on public.pipeline_control from public, anon, authenticated;

create or replace function public.acquire_swing_signal_pipeline_lease()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean;
begin
  update public.pipeline_control
  set lease_until = now() + interval '2 minutes', updated_at = now()
  where id = true and (lease_until is null or lease_until < now())
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_swing_signal_pipeline_lease(p_completed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pipeline_control
  set lease_until = null,
      last_completed_at = case when p_completed then now() else last_completed_at end,
      updated_at = now()
  where id = true;
end;
$$;

revoke all on function public.acquire_swing_signal_pipeline_lease() from public, anon, authenticated;
revoke all on function public.release_swing_signal_pipeline_lease(boolean) from public, anon, authenticated;
grant execute on function public.acquire_swing_signal_pipeline_lease() to service_role;
grant execute on function public.release_swing_signal_pipeline_lease(boolean) to service_role;

commit;
