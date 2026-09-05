import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import nextEnv from '@next/env';

import { importFundamentalCsv } from '../lib/market/fundamentals';
import { createAdminClient } from '../lib/supabase/admin';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const file = resolve(process.argv[2] ?? 'data/fundamentals.csv');
async function main() {
  const result = await importFundamentalCsv(createAdminClient(), await readFile(file, 'utf8'));
  console.log(`Imported ${result.importedCount} dated fundamental snapshots from ${file}.`);
  if (result.skippedSymbols.length) console.warn(`Skipped unknown symbols: ${result.skippedSymbols.join(', ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
