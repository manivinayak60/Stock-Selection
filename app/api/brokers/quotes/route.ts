import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';
import { getBrokerConnection } from '@/lib/brokers/connections';
import { fetchGrowwQuotes, fetchKiteQuotes } from '@/lib/brokers/quotes';
import type { LiveProvider } from '@/lib/brokers/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') as LiveProvider | null;
    const symbols = [...new Set((url.searchParams.get('symbols') ?? '')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => /^[A-Z0-9&.-]{1,20}$/.test(symbol)))]
      .slice(0, 50);
    if ((provider !== 'KITE_CONNECT' && provider !== 'GROWW_CONNECT') || !symbols.length) {
      return NextResponse.json({ error: 'Provider and symbols are required' }, { status: 400 });
    }
    const connection = await getBrokerConnection(userId, provider);
    if (!connection || connection.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Broker is not connected', fallback: 'FREE_EOD' }, { status: 409 });
    }
    if (connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now()) {
      return NextResponse.json({ error: 'Broker session expired', fallback: 'FREE_EOD' }, { status: 409 });
    }
    const quotes = provider === 'KITE_CONNECT'
      ? await fetchKiteQuotes(symbols, connection.accessToken)
      : await fetchGrowwQuotes(symbols, connection.accessToken);
    return NextResponse.json({ provider, quotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live quote request failed';
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : 502;
    return NextResponse.json({ error: status === 401 ? 'Authentication required' : message, fallback: 'FREE_EOD' }, { status });
  }
}
