import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFundamentalCsv } from '../lib/market/fundamentals';

const header = 'symbol,as_of_date,market_cap_cr,debt_equity,opm,roe,sales_growth,capital_adequacy,gross_npa,net_npa,source_name,source_url';

void test('fundamental CSV preserves dated, source-backed quality evidence', () => {
  const rows = parseFundamentalCsv(`${header}\nTEST,2026-06-30,12000,0.4,18,16,12,,,,Audited filing,https://example.com/filing`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'TEST');
  assert.equal(rows[0].market_cap_cr, 12_000);
  assert.equal(rows[0].debt_equity, 0.4);
  assert.equal(rows[0].source_name, 'Audited filing');
});

void test('fundamental CSV rejects missing provenance and duplicate symbols', () => {
  assert.throws(
    () => parseFundamentalCsv(`${header}\nTEST,2026-06-30,12000,0.4,18,16,12,,,,,`),
    /source_name/,
  );
  assert.throws(
    () => parseFundamentalCsv(`${header}\nTEST,2026-06-30,12000,0.4,18,16,12,,,,Source,\nTEST,2026-06-30,12000,0.4,18,16,12,,,,Source,`),
    /Duplicate symbol/,
  );
});
