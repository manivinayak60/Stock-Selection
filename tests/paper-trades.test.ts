import assert from 'node:assert/strict';
import test from 'node:test';

import { paperTradePerformance, type PaperTrade } from '../lib/trading';

const trade: PaperTrade = {
  id: 1,
  symbol: 'TEST',
  setup: 'Confirmed breakout',
  status: 'OPEN',
  entry: 100,
  stop: 95,
  target: 115,
  quantity: 10,
  openedAt: '2026-09-07T04:00:00.000Z',
  entryMarketDate: '2026-09-07',
  dailyMarks: [
    { marketDate: '2026-09-08', open: 101, high: 104, low: 99, close: 103, source: 'NSE_EOD', recordedAt: '2026-09-08T12:00:00.000Z' },
    { marketDate: '2026-09-09', open: 102, high: 106, low: 98, close: 101, source: 'NSE_EOD', recordedAt: '2026-09-09T12:00:00.000Z' },
  ],
};

void test('paper trade performance separates latest-session and total P&L', () => {
  const result = paperTradePerformance(trade);
  assert.equal(result.latestPrice, 101);
  assert.equal(result.dailyChangePct, -1.94);
  assert.equal(result.totalPnl, 10);
  assert.equal(result.totalPnlPct, 1);
  assert.equal(result.sessionsMarked, 2);
  assert.equal(result.maxFavourablePnl, 60);
  assert.equal(result.maxAdversePnl, -20);
});

void test('paper trade without a later EOD mark starts at zero P&L', () => {
  const result = paperTradePerformance({ ...trade, dailyMarks: [] });
  assert.equal(result.latestPrice, 100);
  assert.equal(result.totalPnl, 0);
  assert.equal(result.sessionsMarked, 0);
});
