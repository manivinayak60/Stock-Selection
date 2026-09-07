import assert from 'node:assert/strict';
import test from 'node:test';

import { candidateSessionDates } from '../lib/market/nse';

const iso = (dates: Date[]) => dates.map((date) => date.toISOString().slice(0, 10));

void test('EOD scan probes the same NSE session after 16:15 IST', () => {
  assert.deepEqual(
    iso(candidateSessionDates(new Date('2026-09-07T11:00:00.000Z'), 2)),
    ['2026-09-07', '2026-09-04'],
  );
});

void test('morning scan uses the previous completed NSE session', () => {
  assert.deepEqual(
    iso(candidateSessionDates(new Date('2026-09-07T03:30:00.000Z'), 2)),
    ['2026-09-04', '2026-09-03'],
  );
});

void test('post-close Friday scan does not include weekend dates', () => {
  assert.deepEqual(
    iso(candidateSessionDates(new Date('2026-09-04T11:00:00.000Z'), 3)),
    ['2026-09-04', '2026-09-03', '2026-09-02'],
  );
});
