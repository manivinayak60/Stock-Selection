import { parseCsv, numeric } from './csv';
import type { Candle, Instrument } from './types';

const NSE_ARCHIVE = 'https://nsearchives.nseindia.com';
const REQUEST_HEADERS = {
  accept: 'text/csv,*/*',
  referer: 'https://www.nseindia.com/all-reports',
  'user-agent':
    'Mozilla/5.0 (compatible; SwingSignal/1.0; personal EOD research tool)',
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function compactDate(date: Date) {
  return `${pad(date.getUTCDate())}${pad(date.getUTCMonth() + 1)}${date.getUTCFullYear()}`;
}

function isoDate(value: string) {
  const match = value.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const month = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ].indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  return `${match[3]}-${pad(month + 1)}-${match[1]}`;
}

function isoIndexDate(value: string) {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

async function fetchText(url: string, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`NSE request failed (${response.status})`);
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (contentType.includes('text/html') || /^\s*</.test(text)) {
    throw new Error('NSE returned an HTML challenge instead of CSV data');
  }
  return text;
}

export async function fetchNifty500Universe(): Promise<Instrument[]> {
  const [text, nifty50Text] = await Promise.all([
    fetchText(`${NSE_ARCHIVE}/content/indices/ind_nifty500list.csv`),
    fetchText(`${NSE_ARCHIVE}/content/indices/ind_nifty50list.csv`),
  ]);
  const nifty50Symbols = new Set(
    parseCsv(nifty50Text)
      .map((row) => row.Symbol?.trim().toUpperCase())
      .filter((symbol): symbol is string => Boolean(symbol)),
  );
  if (nifty50Symbols.size < 45 || nifty50Symbols.size > 55) {
    throw new Error(`Unexpected Nifty 50 universe size: ${nifty50Symbols.size}`);
  }
  const rows = parseCsv(text);
  const instruments = rows.flatMap((row) => {
    const symbol = row.Symbol?.toUpperCase();
    const companyName = row['Company Name'];
    const industry = row.Industry;
    const series = row.Series;
    const isin = row['ISIN Code'];
    if (!symbol || !companyName || !industry || !series || !isin) return [];
    const isBank = /\bbank\b/i.test(companyName) || /\bbank\b/i.test(industry);
    const financeName = /\b(finance|financial|finserv|capital|credit|leasing|investments?)\b/i.test(companyName);
    const excludedFinance = /\b(exchange|depository|rating|insurance|asset management|broker)\b/i.test(`${companyName} ${industry}`);
    return [{
      symbol,
      companyName,
      industry,
      series,
      isin,
      isBank,
      isNbfc: !isBank && financeName && !excludedFinance,
      isNifty50: nifty50Symbols.has(symbol),
    }];
  });
  if (instruments.length < 450 || instruments.length > 550) {
    throw new Error(`Unexpected Nifty 500 universe size: ${instruments.length}`);
  }
  return instruments;
}

export async function fetchEquityBhavcopy(date: Date) {
  const text = await fetchText(
    `${NSE_ARCHIVE}/products/content/sec_bhavdata_full_${compactDate(date)}.csv`,
    30_000,
  );
  const rows = parseCsv(text);
  const candles = new Map<string, Candle>();
  for (const row of rows) {
    if (row.SERIES !== 'EQ') continue;
    const marketDate = isoDate(row.DATE1);
    const open = numeric(row.OPEN_PRICE);
    const high = numeric(row.HIGH_PRICE);
    const low = numeric(row.LOW_PRICE);
    const close = numeric(row.CLOSE_PRICE);
    const volume = numeric(row.TTL_TRD_QNTY);
    const turnoverLacs = numeric(row.TURNOVER_LACS);
    if (
      !row.SYMBOL || !marketDate || open === null || high === null ||
      low === null || close === null || volume === null || turnoverLacs === null ||
      low <= 0 || low > high || close <= 0
    ) continue;
    candles.set(row.SYMBOL.toUpperCase(), {
      date: marketDate,
      open,
      high,
      low,
      close,
      volume,
      turnoverLacs,
      trades: numeric(row.NO_OF_TRADES),
      deliveryPercent: numeric(row.DELIV_PER),
    });
  }
  if (candles.size < 1_000) {
    throw new Error(`Unexpected NSE bhavcopy row count: ${candles.size}`);
  }
  return candles;
}

export async function fetchNifty500Candle(date: Date): Promise<Candle> {
  const text = await fetchText(
    `${NSE_ARCHIVE}/content/indices/ind_close_all_${compactDate(date)}.csv`,
  );
  const row = parseCsv(text).find(
    (item) => item['Index Name']?.trim().toLowerCase() === 'nifty 500',
  );
  if (!row) throw new Error('Nifty 500 row is missing from index snapshot');
  const marketDate = isoIndexDate(row['Index Date']);
  const open = numeric(row['Open Index Value']);
  const high = numeric(row['High Index Value']);
  const low = numeric(row['Low Index Value']);
  const close = numeric(row['Closing Index Value']);
  if (!marketDate || open === null || high === null || low === null || close === null) {
    throw new Error('Nifty 500 index snapshot contains invalid values');
  }
  return {
    date: marketDate,
    open,
    high,
    low,
    close,
    volume: numeric(row.Volume) ?? 0,
    turnoverLacs: (numeric(row['Turnover (Rs. Cr.)']) ?? 0) * 100,
  };
}

export function candidateSessionDates(now = new Date(), count = 10) {
  const istOffsetMs = 5.5 * 60 * 60 * 1_000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const beforeExpectedPublication = ist.getUTCHours() < 20;
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  if (beforeExpectedPublication) start.setUTCDate(start.getUTCDate() - 1);
  const dates: Date[] = [];
  for (let offset = 0; dates.length < count && offset < count + 10; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - offset);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date);
  }
  return dates;
}

export async function fetchLatestNseSession(now = new Date()) {
  const failures: string[] = [];
  for (const date of candidateSessionDates(now)) {
    try {
      const [equities, benchmark] = await Promise.all([
        fetchEquityBhavcopy(date),
        fetchNifty500Candle(date),
      ]);
      if (benchmark.date !== [...equities.values()][0]?.date) {
        throw new Error('Equity and benchmark dates do not match');
      }
      return { date: benchmark.date, equities, benchmark, failures };
    } catch (error) {
      failures.push(
        `${date.toISOString().slice(0, 10)}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
  throw new Error(`No recent NSE session was available. ${failures.join('; ')}`);
}
