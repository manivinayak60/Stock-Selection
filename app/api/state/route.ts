import { NextResponse } from 'next/server';

import { defaultSettings } from '@/lib/trading';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SettingsRow = {
  capital: number;
  normal_risk: number;
  hard_risk: number;
  per_stock_risk: number;
  max_positions: number;
  max_sector_allocation: number;
  provider: string;
};

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

function databaseError(message: string) {
  console.error(message);
  return NextResponse.json({ error: 'Unable to access saved data' }, { status: 500 });
}

function mapSettings(row: SettingsRow | null) {
  if (!row) return defaultSettings;
  return {
    capital: row.capital,
    normalRisk: row.normal_risk,
    hardRisk: row.hard_risk,
    perStockRisk: row.per_stock_risk,
    maxPositions: row.max_positions,
    maxSectorAllocation: row.max_sector_allocation,
    provider: row.provider as typeof defaultSettings.provider,
  };
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return { supabase, userId: error ? undefined : userId };
}

export async function GET() {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return unauthorized();

  const [settingsResult, watchlistResult, tradesResult, runsResult] = await Promise.all([
    supabase
      .from('settings')
      .select('capital, normal_risk, hard_risk, per_stock_risk, max_positions, max_sector_allocation, provider')
      .eq('user_id', userId)
      .maybeSingle<SettingsRow>(),
    supabase
      .from('watchlist')
      .select('symbol, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('paper_trades')
      .select('id, symbol, sector, setup, status, entry, stop, target, quantity, opened_at, closed_at, exit_price, notes')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false }),
    supabase
      .from('scan_runs')
      .select('id, market_date, provider, status, universe_count, qualified_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const error = settingsResult.error ?? watchlistResult.error ?? tradesResult.error ?? runsResult.error;
  if (error) return databaseError(error.message);

  return NextResponse.json({
    settings: mapSettings(settingsResult.data),
    watchlist: (watchlistResult.data ?? []).map((row) => ({
      symbol: row.symbol,
      note: row.note,
      createdAt: row.created_at,
    })),
    trades: (tradesResult.data ?? []).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      sector: row.sector,
      setup: row.setup,
      status: row.status,
      entry: row.entry,
      stop: row.stop,
      target: row.target,
      quantity: row.quantity,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      exitPrice: row.exit_price,
      notes: row.notes,
    })),
    runs: (runsResult.data ?? []).map((row) => ({
      id: row.id,
      marketDate: row.market_date,
      provider: row.provider,
      status: row.status,
      universeCount: row.universe_count,
      qualifiedCount: row.qualified_count,
      createdAt: row.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return unauthorized();

  const body = (await request.json()) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : '';
  const now = new Date().toISOString();

  if (action === 'saveSettings') {
    const s = body.settings as typeof defaultSettings;
    if (
      !s || s.capital <= 0 || s.normalRisk <= 0 || s.hardRisk < s.normalRisk ||
      s.perStockRisk <= 0 || s.maxPositions < 1 || s.maxSectorAllocation <= 0 ||
      s.maxSectorAllocation > 100 || !['FREE_EOD', 'KITE_CONNECT'].includes(s.provider)
    ) {
      return NextResponse.json({ error: 'Invalid risk settings' }, { status: 400 });
    }

    const { error } = await supabase.from('settings').upsert({
      user_id: userId,
      capital: s.capital,
      normal_risk: s.normalRisk,
      hard_risk: s.hardRisk,
      per_stock_risk: s.perStockRisk,
      max_positions: s.maxPositions,
      max_sector_allocation: s.maxSectorAllocation,
      provider: s.provider,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (error) return databaseError(error.message);
    return NextResponse.json({ ok: true });
  }

  if (action === 'toggleWatchlist') {
    const symbol = typeof body.symbol === 'string' ? body.symbol.toUpperCase() : '';
    if (!/^[A-Z0-9&.-]{1,20}$/.test(symbol)) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }
    const existing = await supabase
      .from('watchlist')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .maybeSingle();
    if (existing.error) return databaseError(existing.error.message);

    const result = existing.data
      ? await supabase.from('watchlist').delete().eq('user_id', userId).eq('symbol', symbol)
      : await supabase.from('watchlist').insert({ user_id: userId, symbol, note: '', created_at: now });
    if (result.error) return databaseError(result.error.message);
    return NextResponse.json({ ok: true, added: !existing.data });
  }

  if (action === 'createTrade') {
    const trade = body.trade as {
      symbol: string;
      setup: string;
      entry: number;
      stop: number;
      target: number;
      quantity: number;
      notes?: string;
    };
    if (
      !trade || !/^[A-Z0-9&.-]{1,20}$/.test(trade.symbol) ||
      trade.entry <= trade.stop || trade.target <= trade.entry ||
      !Number.isInteger(trade.quantity) || trade.quantity < 1
    ) {
      return NextResponse.json({ error: 'Invalid trade plan' }, { status: 400 });
    }

    const result = await supabase.rpc('create_paper_trade_atomic', {
      p_symbol: trade.symbol,
      p_sector: typeof body.sector === 'string' ? body.sector : 'Unknown',
      p_setup: trade.setup,
      p_entry: trade.entry,
      p_stop: trade.stop,
      p_target: trade.target,
      p_quantity: trade.quantity,
      p_notes: trade.notes ?? '',
    });
    if (result.error) {
      const businessError = [
        'already exists', 'limit', 'exceeded', 'Maximum', 'Invalid trade',
      ].some((part) => result.error.message.includes(part));
      return NextResponse.json(
        { error: businessError ? result.error.message : 'Unable to save paper trade' },
        { status: businessError ? 409 : 500 },
      );
    }
    return NextResponse.json({ ok: true, id: Number(result.data) });
  }

  if (action === 'closeTrade') {
    const id = Number(body.id);
    const exitPrice = Number(body.exitPrice);
    if (!Number.isInteger(id) || exitPrice <= 0) {
      return NextResponse.json({ error: 'Invalid exit details' }, { status: 400 });
    }
    const { error } = await supabase
      .from('paper_trades')
      .update({ status: 'CLOSED', exit_price: exitPrice, closed_at: now })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('status', 'OPEN');
    if (error) return databaseError(error.message);
    return NextResponse.json({ ok: true });
  }

  if (action === 'recordScan') {
    const universeCount = Number(body.universeCount);
    const qualifiedCount = Number(body.qualifiedCount);
    if (
      !Number.isInteger(universeCount) || !Number.isInteger(qualifiedCount) ||
      universeCount < 0 || qualifiedCount < 0 || qualifiedCount > universeCount
    ) {
      return NextResponse.json({ error: 'Invalid scan summary' }, { status: 400 });
    }
    const { error } = await supabase.from('scan_runs').insert({
      user_id: userId,
      market_date: String(body.marketDate),
      provider: String(body.provider),
      status: 'COMPLETED',
      universe_count: universeCount,
      qualified_count: qualifiedCount,
      created_at: now,
    });
    if (error) return databaseError(error.message);
    return NextResponse.json({ ok: true, createdAt: now });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
