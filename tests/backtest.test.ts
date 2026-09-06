import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeObservations } from '../scripts/backtest-scoring';

void test('backtest summary reports forward returns and ten-session win rate', () => {
  const result = summarizeObservations([
    { score: 75, return5: 2, return10: 4, return20: 6 },
    { score: 82, return5: -1, return10: -2, return20: 3 },
  ]);
  assert.equal(result.observations, 2);
  assert.equal(result.winRate10, 50);
  assert.equal(result.averageReturn5, 0.5);
  assert.equal(result.averageReturn10, 1);
  assert.equal(result.averageReturn20, 4.5);
  assert.equal(result.medianReturn10, 1);
  assert.equal(result.profitFactor10, 2);
  assert.equal(result.worstReturn10, -2);
});
