import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFundamentalTemplateCsv,
  selectFundamentalTemplateCandidates,
} from '../lib/market/fundamental-template';
import type { CandidateSnapshot } from '../lib/trading';

const candidate = (
  symbol: string,
  score: number,
  change: number,
  status: CandidateSnapshot['status'] = 'Watch',
): CandidateSnapshot => ({
  symbol,
  name: `${symbol} Limited`,
  sector: 'Industrials',
  isBank: false,
  isNbfc: false,
  close: 100,
  change,
  marketCapCr: null,
  debtEquity: null,
  opm: null,
  roe: null,
  salesGrowth: null,
  capitalAdequacy: null,
  grossNpa: null,
  netNpa: null,
  trend: 20,
  momentum: 10,
  relativeStrength: 10,
  volume: 8,
  regime: 6,
  qualityScore: 0,
  setupScore: 4,
  score,
  status,
  atr: 2,
  setup: 'Momentum continuation',
  thesis: 'Test evidence',
  caution: 'Test caution',
  prices: [95, 100],
  asOfDate: '2026-09-04',
  evidenceStatus: status === 'Watch' ? 'REVIEW' : 'VALID',
  medianTurnoverLacs20: 1000,
  relativeVolume20: 1.2,
  rsi14: 60,
  macdHistogram: 1,
  support: 90,
  resistance: 101,
  high52Week: 110,
  breakdown: [],
});

void test('shortlist template combines groups without duplicate symbols', () => {
  const selected = selectFundamentalTemplateCandidates([
    candidate('BOTH', 75, 3, 'Qualified'),
    candidate('MOVER', 60, 5),
    candidate('FALLER', 80, -2),
  ]);
  assert.deepEqual(selected.map((row) => row.symbol), ['FALLER', 'BOTH', 'MOVER']);
  assert.deepEqual(
    selected.find((row) => row.symbol === 'BOTH')?.selectionGroups,
    ['Qualified', 'Score 70+', 'Nifty Bullish 20'],
  );
});

void test('shortlist CSV prefills saved fundamentals and marks missing rows', () => {
  const selected = selectFundamentalTemplateCandidates([
    candidate('READY', 75, 2, 'Qualified'),
    candidate('MISSING', 70, 1),
  ]);
  const csv = buildFundamentalTemplateCsv(selected, [{
    symbol: 'READY',
    as_of_date: '2026-08-01',
    market_cap_cr: 25_000,
    debt_equity: 0.2,
    opm: 20,
    roe: 18,
    sales_growth: 12,
    capital_adequacy: null,
    gross_npa: null,
    net_npa: null,
    source_name: 'Annual report',
    source_url: 'https://example.com/report',
  }], '2026-09-04');
  assert.match(csv, /READY Limited/);
  assert.match(csv, /No,READY/);
  assert.match(csv, /Yes,MISSING/);
  assert.match(csv, /2026-08-01,25000,0.2,20,18,12/);
});
