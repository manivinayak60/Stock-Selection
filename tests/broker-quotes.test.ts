import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchGrowwQuotes } from '../lib/brokers/quotes';

const symbols = Array.from({ length: 51 }, (_, index) => `STOCK${index + 1}`);

void test('Groww quotes preserve successful batches when another batch fails', async (context) => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    return call === 1
      ? new Response(JSON.stringify({ status: 'SUCCESS', payload: { NSE_STOCK1: 123.45 } }), { status: 200 })
      : new Response(JSON.stringify({ status: 'FAILURE', error: { message: 'Unknown symbol' } }), { status: 400 });
  }) as typeof fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  const result = await fetchGrowwQuotes(symbols, 'valid-test-token');
  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].symbol, 'STOCK1');
  assert.deepEqual(result.warnings, ['Unknown symbol']);
});

void test('Groww authentication rejection invalidates the whole request', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ status: 'FAILURE', error: { message: 'Unauthorised' } }),
    { status: 401 },
  )) as typeof fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    fetchGrowwQuotes(['RELIANCE'], 'expired-test-token'),
    /BROKER_AUTH_REJECTED/,
  );
});

void test('Groww permission denial is distinct from an expired token', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ status: 'FAILURE', error: { message: 'Live data entitlement required' } }),
    { status: 403 },
  )) as typeof fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    fetchGrowwQuotes(['RELIANCE'], 'valid-but-unentitled-token'),
    /BROKER_PERMISSION_DENIED:Live data entitlement required/,
  );
});
