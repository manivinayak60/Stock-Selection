import type { SupabaseClient } from '@supabase/supabase-js';

import { numeric, parseCsv } from './csv';

const REQUIRED_COLUMNS = ['symbol', 'as_of_date', 'market_cap_cr', 'source_name'];
const MAX_ROWS = 1_000;
export const MAX_FUNDAMENTALS_CSV_BYTES = 2_000_000;

function optionalNumber(value: string, rowNumber: number, column: string) {
  const parsed = numeric(value);
  if (parsed !== null && (!Number.isFinite(parsed) || Math.abs(parsed) > 1_000_000)) {
    throw new Error(`Invalid ${column} on CSV row ${rowNumber}`);
  }
  return parsed;
}

export function parseFundamentalCsv(text: string) {
  if (Buffer.byteLength(text, 'utf8') > MAX_FUNDAMENTALS_CSV_BYTES) {
    throw new Error('Fundamentals CSV must be smaller than 2 MB');
  }
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The fundamentals CSV contains no data rows');
  if (rows.length > MAX_ROWS) throw new Error(`Fundamentals CSV cannot exceed ${MAX_ROWS} rows`);
  for (const column of REQUIRED_COLUMNS) {
    if (!(column in rows[0])) throw new Error(`Missing required column: ${column}`);
  }

  const seen = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const symbol = row.symbol.trim().toUpperCase();
    const marketCapCr = numeric(row.market_cap_cr);
    if (!/^[A-Z0-9&.-]{1,20}$/.test(symbol)) {
      throw new Error(`Invalid symbol on CSV row ${rowNumber}`);
    }
    if (seen.has(symbol)) throw new Error(`Duplicate symbol ${symbol} on CSV row ${rowNumber}`);
    seen.add(symbol);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.as_of_date) || Number.isNaN(Date.parse(row.as_of_date))) {
      throw new Error(`Invalid as_of_date on CSV row ${rowNumber}; use YYYY-MM-DD`);
    }
    if (!marketCapCr || marketCapCr <= 0 || !row.source_name.trim()) {
      throw new Error(`Invalid market_cap_cr or source_name on CSV row ${rowNumber}`);
    }
    const sourceUrl = row.source_url.trim();
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) {
      throw new Error(`source_url must use HTTPS on CSV row ${rowNumber}`);
    }
    return {
      symbol,
      as_of_date: row.as_of_date,
      market_cap_cr: marketCapCr,
      debt_equity: optionalNumber(row.debt_equity, rowNumber, 'debt_equity'),
      opm: optionalNumber(row.opm, rowNumber, 'opm'),
      roe: optionalNumber(row.roe, rowNumber, 'roe'),
      sales_growth: optionalNumber(row.sales_growth, rowNumber, 'sales_growth'),
      capital_adequacy: optionalNumber(row.capital_adequacy, rowNumber, 'capital_adequacy'),
      gross_npa: optionalNumber(row.gross_npa, rowNumber, 'gross_npa'),
      net_npa: optionalNumber(row.net_npa, rowNumber, 'net_npa'),
      source_name: row.source_name.trim(),
      source_url: sourceUrl || null,
      imported_at: new Date().toISOString(),
    };
  });
}

export async function importFundamentalCsv(admin: SupabaseClient, text: string) {
  const parsed = parseFundamentalCsv(text);
  const { data: instruments, error: instrumentsError } = await admin
    .from('instruments')
    .select('symbol')
    .in('symbol', parsed.map((row) => row.symbol));
  if (instrumentsError) throw new Error(instrumentsError.message);
  const known = new Set((instruments ?? []).map((row) => String(row.symbol)));
  const values = parsed.filter((row) => known.has(row.symbol));
  const skippedSymbols = parsed.filter((row) => !known.has(row.symbol)).map((row) => row.symbol);
  if (!values.length) throw new Error('None of the CSV symbols belong to the current NSE universe');

  for (let index = 0; index < values.length; index += 400) {
    const { error } = await admin
      .from('fundamentals')
      .upsert(values.slice(index, index + 400), { onConflict: 'symbol' });
    if (error) throw new Error(error.message);
  }
  return { importedCount: values.length, skippedSymbols };
}

export async function syncConfiguredFundamentals(admin: SupabaseClient) {
  const source = process.env.FUNDAMENTALS_CSV_URL?.trim();
  if (!source) return null;
  if (!/^https:\/\//i.test(source)) throw new Error('FUNDAMENTALS_CSV_URL must use HTTPS');
  const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Fundamentals source returned HTTP ${response.status}`);
  return importFundamentalCsv(admin, await response.text());
}
