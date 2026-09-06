import { getNifty50Top20, type CandidateSnapshot } from '@/lib/trading';

export type FundamentalTemplateRow = {
  symbol: string;
  as_of_date: string;
  market_cap_cr: number | null;
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

type SelectedCandidate = CandidateSnapshot & { selectionGroups: string[] };

export function selectFundamentalTemplateCandidates(
  candidates: CandidateSnapshot[],
): SelectedCandidate[] {
  const selected = new Map<string, SelectedCandidate>();
  const add = (candidate: CandidateSnapshot, group: string) => {
    const existing = selected.get(candidate.symbol);
    if (existing) {
      if (!existing.selectionGroups.includes(group)) existing.selectionGroups.push(group);
      return;
    }
    selected.set(candidate.symbol, { ...candidate, selectionGroups: [group] });
  };

  candidates
    .filter((candidate) => candidate.status !== 'Watch')
    .forEach((candidate) => add(candidate, 'Qualified'));
  candidates
    .filter((candidate) => candidate.score >= 70)
    .forEach((candidate) => add(candidate, 'Score 70+'));
  getNifty50Top20(candidates)
    .forEach((candidate) => add(candidate, 'Nifty 50 Top 20'));

  return [...selected.values()].sort((a, b) => b.score - a.score);
}

const csvCell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // Prevent imported text from becoming a spreadsheet formula when opened in
  // Excel or Google Sheets. Numeric values retain their numeric representation.
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function buildFundamentalTemplateCsv(
  candidates: SelectedCandidate[],
  fundamentals: FundamentalTemplateRow[],
  marketDate: string,
) {
  const latest = new Map<string, FundamentalTemplateRow>();
  for (const row of fundamentals) {
    if (!latest.has(row.symbol)) latest.set(row.symbol, row);
  }
  const headers = [
    'selection_groups',
    'needs_fundamental_update',
    'symbol',
    'company_name',
    'sector',
    'score',
    'latest_close',
    'day_change_pct',
    'market_date',
    'as_of_date',
    'market_cap_cr',
    'debt_equity',
    'opm',
    'roe',
    'sales_growth',
    'capital_adequacy',
    'gross_npa',
    'net_npa',
    'source_name',
    'source_url',
  ];
  const rows = candidates.map((candidate) => {
    const stored = latest.get(candidate.symbol);
    return [
      candidate.selectionGroups.join(' | '),
      stored ? 'No' : 'Yes',
      candidate.symbol,
      candidate.name,
      candidate.sector,
      candidate.score,
      candidate.close,
      candidate.change,
      marketDate,
      stored?.as_of_date ?? '',
      stored?.market_cap_cr ?? candidate.marketCapCr,
      stored?.debt_equity ?? candidate.debtEquity,
      stored?.opm ?? candidate.opm,
      stored?.roe ?? candidate.roe,
      stored?.sales_growth ?? candidate.salesGrowth,
      stored?.capital_adequacy ?? candidate.capitalAdequacy,
      stored?.gross_npa ?? candidate.grossNpa,
      stored?.net_npa ?? candidate.netNpa,
      stored?.source_name ?? '',
      stored?.source_url ?? '',
    ].map(csvCell).join(',');
  });
  return `${headers.join(',')}\r\n${rows.join('\r\n')}\r\n`;
}
