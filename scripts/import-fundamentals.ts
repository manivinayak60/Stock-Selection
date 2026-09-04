import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { loadEnvConfig } from '@next/env';

import { numeric, parseCsv } from '../lib/market/csv';
import { createAdminClient } from '../lib/supabase/admin';

loadEnvConfig(process.cwd());

const file = resolve(process.argv[2] ?? 'data/fundamentals.csv');
const required = ['symbol', 'as_of_date', 'market_cap_cr', 'source_name'];

async function main() {
  const rows = parseCsv(await readFile(file, 'utf8'));
  if (!rows.length) throw new Error('The fundamentals CSV contains no data rows');
  for (const column of required) {
    if (!(column in rows[0])) throw new Error(`Missing required column: ${column}`);
  }

  const values = rows.map((row, index) => {
    const marketCapCr = numeric(row.market_cap_cr);
    if (!row.symbol || !/^\d{4}-\d{2}-\d{2}$/.test(row.as_of_date) || !marketCapCr || !row.source_name) {
      throw new Error(`Invalid required value on CSV row ${index + 2}`);
    }
    return {
      symbol: row.symbol.toUpperCase(),
      as_of_date: row.as_of_date,
      market_cap_cr: marketCapCr,
      debt_equity: numeric(row.debt_equity),
      opm: numeric(row.opm),
      roe: numeric(row.roe),
      sales_growth: numeric(row.sales_growth),
      capital_adequacy: numeric(row.capital_adequacy),
      gross_npa: numeric(row.gross_npa),
      net_npa: numeric(row.net_npa),
      source_name: row.source_name,
      source_url: row.source_url || null,
      imported_at: new Date().toISOString(),
    };
  });

  const admin = createAdminClient();
  for (let index = 0; index < values.length; index += 400) {
    const { error } = await admin
      .from('fundamentals')
      .upsert(values.slice(index, index + 400), { onConflict: 'symbol' });
    if (error) throw new Error(error.message);
  }
  console.log(`Imported ${values.length} dated fundamental snapshots from ${file}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
