import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';
import { getBrokerConnection, markBrokerConnectionStatus } from '@/lib/brokers/connections';
import { fetchGrowwQuotes, fetchKiteQuotes } from '@/lib/brokers/quotes';
import type { LiveProvider } from '@/lib/brokers/types';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

function cleanSymbols(values: unknown[]) {
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9&.-]{1,20}$/.test(symbol)))]
    .slice(0, 500);
}

async function respond(provider: LiveProvider | null, symbols: string[]) {
  let userId: string | null = null;
  try {
    userId = await requireUserId();
    await enforceRateLimit(userId, 'broker-quotes', 6, 60);
    if ((provider !== 'KITE_CONNECT' && provider !== 'GROWW_CONNECT') || !symbols.length) {
      return NextResponse.json({ error: 'Provider and symbols are required' }, { status: 400 });
    }
    const connection = await getBrokerConnection(userId, provider);
    if (!connection || connection.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Broker is not connected', fallback: 'FREE_EOD' }, { status: 409 });
    }
    if (connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now()) {
      await markBrokerConnectionStatus(userId, provider, 'EXPIRED');
      return NextResponse.json({ error: 'Broker session expired', fallback: 'FREE_EOD' }, { status: 409 });
    }
    const quotes = provider === 'KITE_CONNECT'
      ? await fetchKiteQuotes(symbols, connection.accessToken)
      : await fetchGrowwQuotes(symbols, connection.accessToken);
    return NextResponse.json({ provider, quotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live quote request failed';
    if (message === 'BROKER_AUTH_REJECTED' && userId && provider) {
      try {
        await markBrokerConnectionStatus(userId, provider, 'EXPIRED');
      } catch {
        // Preserve the original provider failure response.
      }
    }
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : message === 'RATE_LIMITED' ? 429 : 502;
    return NextResponse.json({
      error: status === 401
        ? 'Authentication required'
        : status === 429
          ? 'Live quote refresh is temporarily rate limited'
          : message === 'BROKER_AUTH_REJECTED'
            ? 'Broker session expired; reconnect in Settings'
            : message,
      fallback: 'FREE_EOD',
    }, { status });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return respond(
    url.searchParams.get('provider') as LiveProvider | null,
    cleanSymbols((url.searchParams.get('symbols') ?? '').split(',')),
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  const body = await request.json() as { provider?: unknown; symbols?: unknown };
  return respond(
    body.provider as LiveProvider | null,
    cleanSymbols(Array.isArray(body.symbols) ? body.symbols : []),
  );
}
