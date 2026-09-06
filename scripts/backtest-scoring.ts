import nextEnv from '@next/env';

import { calculateMarketRegime, calculateTechnicalSnapshot } from '../lib/market/indicators';
import { scoreCandidate } from '../lib/market/scoring';
import type { Candle, FundamentalSnapshot, Instrument } from '../lib/market/types';
import { createAdminClient } from '../lib/supabase/admin';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

type Observation = {
  score: number;
  return5: number;
  return10: number;
  return20: number;
};

export function summarizeObservations(observations: Observation[]) {
  const average = (key: keyof Pick<Observation, 'return5' | 'return10' | 'return20'>) =>
    observations.length
      ? observations.reduce((sum, item) => sum + item[key], 0) / observations.length
      : 0;
  const wins = observations.filter((item) => item.return10 > 0).length;
  return {
    observations: observations.length,
    winRate10: observations.length ? Number(((wins / observations.length) * 100).toFixed(2)) : 0,
    averageReturn5: Number(average('return5').toFixed(2)),
    averageReturn10: Number(average('return10').toFixed(2)),
    averageReturn20: Number(average('return20').toFixed(2)),
  };
}

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

async function main() {
  const admin = createAdminClient();
  const [instrumentResult, stateResult, fundamentalResult] = await Promise.all([
    admin.from('instruments').select('symbol,company_name,industry,series,isin,is_bank,is_nbfc').eq('active', true),
    admin.from('indicator_states').select('symbol,candles'),
    admin.from('fundamentals').select('*').order('as_of_date', { ascending: true }),
  ]);
  const error = instrumentResult.error ?? stateResult.error ?? fundamentalResult.error;
  if (error) throw new Error(error.message);

  const instruments = (instrumentResult.data ?? []).map((row): Instrument => ({
    symbol: String(row.symbol),
    companyName: String(row.company_name),
    industry: String(row.industry),
    series: String(row.series),
    isin: String(row.isin),
    isBank: Boolean(row.is_bank),
    isNbfc: Boolean(row.is_nbfc),
  }));
  const states = new Map<string, Candle[]>(
    (stateResult.data ?? []).map((row) => [String(row.symbol), row.candles as Candle[]]),
  );
  const fundamentals = new Map<string, FundamentalSnapshot[]>();
  for (const row of fundamentalResult.data ?? []) {
    const snapshot: FundamentalSnapshot = {
      symbol: String(row.symbol),
      asOfDate: String(row.as_of_date),
      marketCapCr: Number(row.market_cap_cr),
      debtEquity: numberOrNull(row.debt_equity),
      opm: numberOrNull(row.opm),
      roe: numberOrNull(row.roe),
      salesGrowth: numberOrNull(row.sales_growth),
      capitalAdequacy: numberOrNull(row.capital_adequacy),
      grossNpa: numberOrNull(row.gross_npa),
      netNpa: numberOrNull(row.net_npa),
      sourceName: String(row.source_name),
      sourceUrl: row.source_url ? String(row.source_url) : null,
    };
    fundamentals.set(snapshot.symbol, [...(fundamentals.get(snapshot.symbol) ?? []), snapshot]);
  }

  const benchmark = states.get('NIFTY500') ?? [];
  const observations: Observation[] = [];
  for (let benchmarkIndex = 199; benchmarkIndex < benchmark.length - 20; benchmarkIndex += 1) {
    const marketDate = benchmark[benchmarkIndex].date;
    const benchmarkHistory = benchmark.slice(0, benchmarkIndex + 1);
    const technical = new Map<string, ReturnType<typeof calculateTechnicalSnapshot>>();
    for (const instrument of instruments) {
      const history = (states.get(instrument.symbol) ?? []).filter((item) => item.date <= marketDate);
      technical.set(instrument.symbol, calculateTechnicalSnapshot(history, benchmarkHistory));
    }
    const valid = [...technical.values()].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const regime = calculateMarketRegime(benchmarkHistory, valid);

    for (const instrument of instruments) {
      const snapshot = technical.get(instrument.symbol);
      if (!snapshot) continue;
      const knownFundamental = (fundamentals.get(instrument.symbol) ?? [])
        .filter((item) => item.asOfDate <= marketDate)
        .at(-1);
      const candidate = scoreCandidate(instrument, snapshot, knownFundamental, regime);
      if (candidate.status === 'Watch') continue;
      const history = states.get(instrument.symbol) ?? [];
      const index = history.findIndex((item) => item.date === marketDate);
      if (index < 0 || !history[index + 20]) continue;
      const percent = (future: number) => ((history[index + future].close / history[index].close) - 1) * 100;
      observations.push({
        score: candidate.score,
        return5: percent(5),
        return10: percent(10),
        return20: percent(20),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    methodology: 'Point-in-time fundamentals; EOD signal close to subsequent 5/10/20-session close; overlapping observations included.',
    score70Plus: summarizeObservations(observations.filter((item) => item.score >= 70)),
    score80Plus: summarizeObservations(observations.filter((item) => item.score >= 80)),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!observations.length) {
    console.warn('No point-in-time qualified observations were available. Import historical fundamental snapshots before calibrating the model.');
  }
}

if (process.argv[1]?.includes('backtest-scoring')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
