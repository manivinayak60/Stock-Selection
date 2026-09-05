import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreCandidate } from '../lib/market/scoring';
import type { FundamentalSnapshot, Instrument, MarketRegime, TechnicalSnapshot } from '../lib/market/types';

const instrument: Instrument = {
  symbol: 'TEST',
  companyName: 'Test Industries',
  industry: 'Industrials',
  series: 'EQ',
  isin: 'INE000000000',
  isBank: false,
};
const technical: TechnicalSnapshot = {
  asOfDate: '2026-09-03', close: 120, change: 2, sma20: 112, sma50: 105,
  sma200: 90, ema20: 111, rsi14: 61, atr14: 3, macd: 4, macdSignal: 2,
  macdHistogram: 2, roc20: 8, roc63: 18, relativeStrength63: 8,
  relativeVolume20: 1.7, medianTurnoverLacs20: 1_500, prior20High: 118,
  support20: 104, high52Week: 125, breakout20: true,
  prices: [105, 107, 109, 111, 114, 120],
};
const regime: MarketRegime = {
  label: 'Bullish', score: 10, benchmarkClose: 20_000, benchmarkSma50: 19_000,
  benchmarkSma200: 18_000, breadthAboveSma50: 64,
};
const fundamental: FundamentalSnapshot = {
  symbol: 'TEST', asOfDate: '2026-08-01', marketCapCr: 20_000, debtEquity: 0.3,
  opm: 22, roe: 18, salesGrowth: 14, capitalAdequacy: null, grossNpa: null,
  netNpa: null, sourceName: 'Audited filing', sourceUrl: null,
};

void test('a technically and fundamentally valid candidate can qualify', () => {
  const candidate = scoreCandidate(instrument, technical, fundamental, regime);
  assert.notEqual(candidate.status, 'Watch');
  assert.equal(candidate.evidenceStatus, 'VALID');
  assert.ok(candidate.score <= 100);
  assert.equal(candidate.support, 104);
  assert.equal(candidate.resistance, 118);
});

void test('missing fundamentals fail closed even with strong technicals', () => {
  const candidate = scoreCandidate(instrument, technical, undefined, regime);
  assert.equal(candidate.status, 'Watch');
  assert.equal(candidate.evidenceStatus, 'REVIEW');
  assert.match(candidate.caution, /missing/i);
});

void test('illiquid securities fail the hard gate', () => {
  const candidate = scoreCandidate(
    instrument,
    { ...technical, medianTurnoverLacs20: 499 },
    fundamental,
    regime,
  );
  assert.equal(candidate.status, 'Watch');
  assert.match(candidate.caution, /turnover/i);
});
