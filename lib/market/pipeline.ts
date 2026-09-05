import type { SupabaseClient } from '@supabase/supabase-js';

import type { CandidateSnapshot } from '@/lib/trading';
import { syncConfiguredFundamentals } from './fundamentals';

import { appendCandle, calculateMarketRegime, calculateTechnicalSnapshot } from './indicators';
import { fetchLatestNseSession, fetchNifty500Universe } from './nse';
import { scoreCandidate } from './scoring';
import type { Candle, FundamentalSnapshot, Instrument } from './types';

const STATE_LIMIT = 260;
const WRITE_BATCH = 400;
const STATE_WRITE_BATCH = 25;
const CANDIDATE_WRITE_BATCH = 50;

type StateRow = { symbol: string; candles: Candle[] };
type FundamentalRow = {
  symbol: string;
  as_of_date: string;
  market_cap_cr: number;
  debt_equity: number | null;
  opm: number | null;
  roe: number | null;
  sales_growth: number | null;
  capital_adequacy: number | null;
  gross_npa: number | null;
  net_npa: number | null;
  source_name: string;
  source_url: string | null;
};

async function writeBatches<T>(
  values: T[],
  operation: (batch: T[]) => PromiseLike<{ error: { message: string } | null }>,
  batchSize = WRITE_BATCH,
) {
  for (let index = 0; index < values.length; index += batchSize) {
    const result = await operation(values.slice(index, index + batchSize));
    if (result.error) throw new Error(result.error.message);
  }
}

function fundamentalFromRow(row: FundamentalRow): FundamentalSnapshot {
  return {
    symbol: row.symbol,
    asOfDate: row.as_of_date,
    marketCapCr: Number(row.market_cap_cr),
    debtEquity: row.debt_equity === null ? null : Number(row.debt_equity),
    opm: row.opm === null ? null : Number(row.opm),
    roe: row.roe === null ? null : Number(row.roe),
    salesGrowth: row.sales_growth === null ? null : Number(row.sales_growth),
    capitalAdequacy: row.capital_adequacy,
    grossNpa: row.gross_npa,
    netNpa: row.net_npa,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
  };
}

export async function persistUniverse(admin: SupabaseClient, universe: Instrument[]) {
  await writeBatches(
    universe.map((item) => ({
      symbol: item.symbol,
      company_name: item.companyName,
      industry: item.industry,
      series: item.series,
      isin: item.isin,
      is_bank: item.isBank,
      active: true,
      updated_at: new Date().toISOString(),
    })),
    (batch) => admin.from('instruments').upsert(batch, { onConflict: 'symbol' }),
  );
}

export async function loadStates(admin: SupabaseClient) {
  const { data, error } = await admin.from('indicator_states').select('symbol, candles');
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as StateRow[]).map((row) => [row.symbol, row.candles ?? []]),
  );
}

export async function persistStates(
  admin: SupabaseClient,
  states: Map<string, Candle[]>,
) {
  const now = new Date().toISOString();
  await writeBatches(
    [...states.entries()].flatMap(([symbol, candles]) => {
      const last = candles.at(-1);
      return last
        ? [{
            symbol,
            as_of_date: last.date,
            candles: candles.slice(-STATE_LIMIT),
            bar_count: candles.length,
            updated_at: now,
          }]
        : [];
    }),
    (batch) => admin.from('indicator_states').upsert(batch, { onConflict: 'symbol' }),
    STATE_WRITE_BATCH,
  );
}

async function loadFundamentals(admin: SupabaseClient) {
  const { data, error } = await admin.from('fundamentals').select('*');
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as FundamentalRow[]).map((row) => [row.symbol, fundamentalFromRow(row)]),
  );
}

export async function persistDailyPrices(
  admin: SupabaseClient,
  equities: Map<string, Candle>,
  benchmark: Candle,
) {
  await writeBatches(
    [...equities.entries()].map(([symbol, candle]) => ({
      symbol,
      market_date: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      turnover_lacs: candle.turnoverLacs,
      trades: candle.trades ?? null,
      delivery_percent: candle.deliveryPercent ?? null,
    })),
    (batch) => admin.from('eod_prices').upsert(batch, { onConflict: 'symbol,market_date' }),
  );
  const { error } = await admin.from('benchmark_prices').upsert({
    symbol: 'NIFTY500',
    market_date: benchmark.date,
    open: benchmark.open,
    high: benchmark.high,
    low: benchmark.low,
    close: benchmark.close,
    volume: benchmark.volume,
  }, { onConflict: 'symbol,market_date' });
  if (error) throw new Error(error.message);
}

export async function createScan(
  admin: SupabaseClient,
  universe: Instrument[],
  states: Map<string, Candle[]>,
  marketDate: string,
  receivedCount: number,
  sourceWarnings: string[] = [],
) {
  const benchmarkCandles = states.get('NIFTY500') ?? [];
  const technical = new Map<string, ReturnType<typeof calculateTechnicalSnapshot>>();
  for (const instrument of universe) {
    const snapshot = calculateTechnicalSnapshot(
      states.get(instrument.symbol) ?? [],
      benchmarkCandles,
    );
    technical.set(
      instrument.symbol,
      snapshot?.asOfDate === marketDate ? snapshot : null,
    );
  }
  const validTechnical = [...technical.values()].filter(
    (value): value is NonNullable<typeof value> => value !== null,
  );
  const regime = calculateMarketRegime(benchmarkCandles, validTechnical);
  const fundamentals = await loadFundamentals(admin);
  const candidates: CandidateSnapshot[] = universe.flatMap((instrument) => {
    const snapshot = technical.get(instrument.symbol);
    return snapshot
      ? [scoreCandidate(instrument, snapshot, fundamentals.get(instrument.symbol), regime)]
      : [];
  });
  const qualifiedCount = candidates.filter((item) => item.status !== 'Watch').length;
  const status = validTechnical.length >= Math.floor(universe.length * 0.9)
    ? 'COMPLETED'
    : 'INSUFFICIENT_HISTORY';
  const warnings = [...sourceWarnings];
  if (fundamentals.size < Math.floor(universe.length * 0.9)) {
    warnings.push(
      `Current fundamentals available for ${fundamentals.size} of ${universe.length} instruments; missing rows remain Watch-only.`,
    );
  }
  if (status === 'INSUFFICIENT_HISTORY') {
    warnings.push(
      `Only ${validTechnical.length} instruments have at least 200 sessions; run the history backfill.`,
    );
  }

  const runResult = await admin
    .from('market_scan_runs')
    .upsert({
      market_date: marketDate,
      provider: 'FREE_EOD',
      status,
      market_regime: regime.label,
      universe_count: universe.length,
      received_count: receivedCount,
      validated_count: validTechnical.length,
      qualified_count: qualifiedCount,
      failed_count: universe.length - validTechnical.length,
      source: 'NSE Nifty 500 + sec_bhavdata_full + index daily snapshot',
      warnings,
      error_message: null,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'market_date,provider' })
    .select('id')
    .single();
  if (runResult.error) throw new Error(runResult.error.message);
  const runId = runResult.data.id as string;
  const deleted = await admin.from('market_scan_candidates').delete().eq('run_id', runId);
  if (deleted.error) throw new Error(deleted.error.message);
  await writeBatches(
    candidates.map((candidate) => ({
      run_id: runId,
      symbol: candidate.symbol,
      sector: candidate.sector,
      status: candidate.status,
      score: candidate.score,
      payload: candidate,
    })),
    (batch) => admin.from('market_scan_candidates').insert(batch),
    CANDIDATE_WRITE_BATCH,
  );
  return { runId, marketDate, status, regime, candidates, warnings };
}

export async function runDailyPipeline(admin: SupabaseClient, now = new Date()) {
  const universe = await fetchNifty500Universe();
  const session = await fetchLatestNseSession(now);
  await persistUniverse(admin, universe);
  const fundamentalsWarnings: string[] = [];
  try {
    const fundamentals = await syncConfiguredFundamentals(admin);
    if (fundamentals?.skippedSymbols.length) {
      fundamentalsWarnings.push(`${fundamentals.skippedSymbols.length} configured fundamental rows were outside the NSE universe.`);
    }
  } catch (error) {
    fundamentalsWarnings.push(`Configured fundamentals refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  const allowed = new Set(universe.map((item) => item.symbol));
  const equities = new Map(
    [...session.equities].filter(([symbol]) => allowed.has(symbol)),
  );
  await persistDailyPrices(admin, equities, session.benchmark);
  const states = await loadStates(admin);
  for (const [symbol, candle] of equities) {
    states.set(symbol, appendCandle(states.get(symbol) ?? [], candle, STATE_LIMIT));
  }
  states.set(
    'NIFTY500',
    appendCandle(states.get('NIFTY500') ?? [], session.benchmark, STATE_LIMIT),
  );
  await persistStates(admin, states);
  const result = await createScan(
    admin,
    universe,
    states,
    session.date,
    equities.size,
    [...session.failures, ...fundamentalsWarnings],
  );
  const pruned = await admin.rpc('prune_swing_signal_history');
  if (pruned.error) console.warn(`History retention cleanup skipped: ${pruned.error.message}`);
  return result;
}
