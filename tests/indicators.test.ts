import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCandle,
  atrWilder,
  emaSeries,
  median,
  rsiWilder,
  sma,
} from '../lib/market/indicators';
import type { Candle } from '../lib/market/types';

const candle = (date: string, close: number): Candle => ({
  date,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: 1_000,
  turnoverLacs: 600,
});

void test('SMA, EMA seed, and median use standard definitions', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4);
  assert.equal(emaSeries([1, 2, 3, 4], 3)[2], 2);
  assert.equal(emaSeries([1, 2, 3, 4], 3)[3], 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

void test('Wilder RSI handles monotonic and flat series', () => {
  assert.equal(rsiWilder(Array.from({ length: 20 }, (_, index) => index + 1)), 100);
  assert.equal(rsiWilder(Array(20).fill(10)), 50);
});

void test('Wilder ATR includes gaps from the prior close', () => {
  const values = Array.from({ length: 16 }, (_, index) => candle(`2026-01-${String(index + 1).padStart(2, '0')}`, 100 + index));
  assert.ok(atrWilder(values) > 0);
});

void test('appendCandle replaces a duplicate date and preserves order and limit', () => {
  const history = [candle('2026-01-01', 10), candle('2026-01-02', 11)];
  const updated = appendCandle(history, candle('2026-01-01', 12), 2);
  assert.deepEqual(updated.map((item) => [item.date, item.close]), [
    ['2026-01-01', 12],
    ['2026-01-02', 11],
  ]);
});
