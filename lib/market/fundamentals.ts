import type { SupabaseClient } from '@supabase/supabase-js';

import { numeric, parseCsv } from './csv';

const REQUIRED_COLUMNS = ['symbol', 'as_of_date', 'market_cap_cr', 'source_name'];
const MAX_ROWS = 1_000;
export const MAX_FUNDAMENTALS_CSV_BYTES = 2_000_000;

type ImportDefaults = {
  asOfDate?: string;
  sourceName?: string;
  sourceUrl?: string;
};

const normalizedHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

function valueFrom(row: Record<string, string>, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizedHeader));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalizedHeader(key)));
  return entry?.[1] ?? '';
}

function isCanonicalCsv(row: Record<string, string>) {
  return REQUIRED_COLUMNS.every((column) => column in row);
}

function optionalNumber(value: string, rowNumber: number, column: string) {
  const parsed = numeric(value);
  if (parsed !== null && (!Number.isFinite(parsed) || Math.abs(parsed) > 1_000_000)) {
    throw new Error(`Invalid ${column} on CSV row ${rowNumber}`);
  }
  return parsed;
}

export function parseFundamentalCsv(text: string, defaults: ImportDefaults = {}) {
  if (Buffer.byteLength(text, 'utf8') > MAX_FUNDAMENTALS_CSV_BYTES) {
    throw new Error('Fundamentals CSV must be smaller than 2 MB');
  }
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The fundamentals CSV contains no data rows');
  if (rows.length > MAX_ROWS) throw new Error(`Fundamentals CSV cannot exceed ${MAX_ROWS} rows`);
  const canonical = isCanonicalCsv(rows[0]);
  if (!canonical && !valueFrom(rows[0], ['NSE Code', 'NSE Symbol'])) {
    throw new Error('CSV must use the SwingSignal template or include a Screener NSE Code column');
  }

  const seen = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const symbol = valueFrom(row, canonical ? ['symbol'] : ['NSE Code', 'NSE Symbol']).trim().toUpperCase();
    const asOfDate = valueFrom(row, ['as_of_date', 'as of date']) || defaults.asOfDate || new Date().toISOString().slice(0, 10);
    const marketCapCr = numeric(valueFrom(row, canonical ? ['market_cap_cr'] : ['Mar Cap Rs.Cr.', 'Market Capitalization', 'Market Cap']));
    const sourceName = valueFrom(row, ['source_name', 'source name']) || defaults.sourceName || (canonical ? '' : 'Screener.in export');
    if (!/^[A-Z0-9&.-]{1,20}$/.test(symbol)) {
      throw new Error(`Invalid symbol on CSV row ${rowNumber}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || Number.isNaN(Date.parse(asOfDate))) {
      throw new Error(`Invalid as_of_date on CSV row ${rowNumber}; use YYYY-MM-DD`);
    }
    const snapshotKey = `${symbol}:${asOfDate}`;
    if (seen.has(snapshotKey)) throw new Error(`Duplicate symbol ${symbol} and date ${asOfDate} on CSV row ${rowNumber}`);
    seen.add(snapshotKey);
    if (!marketCapCr || marketCapCr <= 0 || !sourceName.trim()) {
      throw new Error(`Invalid market_cap_cr or source_name on CSV row ${rowNumber}`);
    }
    const sourceUrl = (valueFrom(row, ['source_url', 'source url']) || defaults.sourceUrl || '').trim();
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) {
      throw new Error(`source_url must use HTTPS on CSV row ${rowNumber}`);
    }
    return {
      symbol,
      as_of_date: asOfDate,
      market_cap_cr: marketCapCr,
      debt_equity: optionalNumber(valueFrom(row, ['debt_equity', 'Debt / Eq', 'Debt to Equity']), rowNumber, 'debt_equity'),
      opm: optionalNumber(valueFrom(row, ['opm', 'OPM %', 'Operating Profit Margin']), rowNumber, 'opm'),
      roe: optionalNumber(valueFrom(row, ['roe', 'ROE %', 'Return on Equity']), rowNumber, 'roe'),
      sales_growth: optionalNumber(valueFrom(row, ['sales_growth', 'Sales growth 3Years', 'Sales Growth']), rowNumber, 'sales_growth'),
      capital_adequacy: optionalNumber(valueFrom(row, ['capital_adequacy', 'Capital Adequacy']), rowNumber, 'capital_adequacy'),
      gross_npa: optionalNumber(valueFrom(row, ['gross_npa', 'Gross NPA %', 'Gross NPA']), rowNumber, 'gross_npa'),
      net_npa: optionalNumber(valueFrom(row, ['net_npa', 'Net NPA %', 'Net NPA']), rowNumber, 'net_npa'),
      source_name: sourceName.trim(),
      source_url: sourceUrl || null,
      imported_at: new Date().toISOString(),
    };
  });
}

export async function importFundamentalCsv(admin: SupabaseClient, text: string, defaults: ImportDefaults = {}) {
  const parsed = parseFundamentalCsv(text, defaults);
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
      .upsert(values.slice(index, index + 400), { onConflict: 'symbol,as_of_date' });
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
  return importFundamentalCsv(admin, await response.text(), { sourceUrl: source });
}
