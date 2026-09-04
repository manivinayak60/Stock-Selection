import { loadEnvConfig } from '@next/env';

import { appendCandle } from '../lib/market/indicators';
import {
  candidateSessionDates,
  fetchEquityBhavcopy,
  fetchNifty500Candle,
  fetchNifty500Universe,
} from '../lib/market/nse';
import {
  createScan,
  persistDailyPrices,
  persistStates,
  persistUniverse,
} from '../lib/market/pipeline';
import type { Candle } from '../lib/market/types';
import { createAdminClient } from '../lib/supabase/admin';

loadEnvConfig(process.cwd());

const TARGET_SESSIONS = 260;
const MAX_CALENDAR_DAYS = 430;

function startDate() {
  return candidateSessionDates(new Date(), 1)[0];
}

async function main() {
  const admin = createAdminClient();
  const universe = await fetchNifty500Universe();
  const allowed = new Set(universe.map((item) => item.symbol));
  const states = new Map<string, Candle[]>();
  const start = startDate();
  let successfulSessions = 0;
  let latestReceivedCount = 0;
  const warnings: string[] = [];

  await persistUniverse(admin, universe);
  console.log(`Backfilling ${universe.length} Nifty 500 instruments from NSE archives.`);

  for (let offset = 0; offset < MAX_CALENDAR_DAYS; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - offset);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;

    try {
      const [allEquities, benchmark] = await Promise.all([
        fetchEquityBhavcopy(date),
        fetchNifty500Candle(date),
      ]);
      const equities = new Map(
        [...allEquities].filter(([symbol]) => allowed.has(symbol)),
      );
      if (benchmark.date !== [...allEquities.values()][0]?.date) {
        throw new Error('equity and benchmark dates differ');
      }

      for (const [symbol, candle] of equities) {
        states.set(symbol, appendCandle(states.get(symbol) ?? [], candle, TARGET_SESSIONS));
      }
      states.set(
        'NIFTY500',
        appendCandle(states.get('NIFTY500') ?? [], benchmark, TARGET_SESSIONS),
      );
      await persistDailyPrices(admin, equities, benchmark);
      successfulSessions += 1;
      if (successfulSessions === 1) latestReceivedCount = equities.size;
      console.log(`${benchmark.date}: ${equities.size} constituents (${successfulSessions}/${TARGET_SESSIONS})`);

      if (successfulSessions % 20 === 0) await persistStates(admin, states);
      if (successfulSessions >= TARGET_SESSIONS) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      if (!/\(404\)/.test(message)) warnings.push(`${date.toISOString().slice(0, 10)}: ${message}`);
    }
  }

  if (successfulSessions < 200) {
    throw new Error(`Only ${successfulSessions} NSE sessions were found; at least 200 are required.`);
  }

  await persistStates(admin, states);
  const latestDate = states.get('NIFTY500')?.at(-1)?.date;
  if (!latestDate) throw new Error('Benchmark history is empty after backfill');
  const result = await createScan(
    admin,
    universe,
    states,
    latestDate,
    latestReceivedCount,
    warnings.slice(-20),
  );
  console.log(
    `Backfill complete: ${successfulSessions} sessions, ${result.candidates.length} scored, status ${result.status}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
