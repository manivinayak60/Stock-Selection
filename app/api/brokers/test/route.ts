import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';
import { getBrokerConnection, markBrokerConnectionStatus } from '@/lib/brokers/connections';
import { fetchGrowwQuotes, fetchKiteQuotes } from '@/lib/brokers/quotes';
import type { LiveProvider } from '@/lib/brokers/types';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let userId: string | null = null;
  let provider: LiveProvider | null = null;
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
    }
    userId = await requireUserId();
    await enforceRateLimit(userId, 'broker-connection-test', 5, 60);
    const body = await request.json() as { provider?: unknown };
    provider = body.provider === 'KITE_CONNECT' || body.provider === 'GROWW_CONNECT'
      ? body.provider
      : null;
    if (!provider) return NextResponse.json({ error: 'Select a live broker first' }, { status: 400 });

    const connection = await getBrokerConnection(userId, provider);
    if (!connection) {
      return NextResponse.json({ error: 'Supabase row not found for this user and provider', rowFound: false }, { status: 404 });
    }
    if (connection.status !== 'CONNECTED') {
      return NextResponse.json({
        error: connection.status === 'EXPIRED' ? 'Saved connection is expired; reconnect with today\'s token' : 'Saved connection is in an error state',
        rowFound: true,
        rowStatus: connection.status,
        expiresAt: connection.expiresAt,
      }, { status: 409 });
    }
    if (connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now()) {
      await markBrokerConnectionStatus(userId, provider, 'EXPIRED');
      return NextResponse.json({
        error: 'Saved token has passed its expiry time; reconnect with today\'s token',
        rowFound: true,
        rowStatus: 'EXPIRED',
        expiresAt: connection.expiresAt,
      }, { status: 409 });
    }

    const quotes = provider === 'KITE_CONNECT'
      ? await fetchKiteQuotes(['RELIANCE'], connection.accessToken)
      : (await fetchGrowwQuotes(['RELIANCE'], connection.accessToken)).quotes;
    const quote = quotes[0];
    if (!quote) throw new Error('Broker authenticated but returned no RELIANCE quote');
    await markBrokerConnectionStatus(userId, provider, 'CONNECTED');
    return NextResponse.json({
      ok: true,
      rowFound: true,
      rowStatus: 'CONNECTED',
      expiresAt: connection.expiresAt,
      accountConfigured: Boolean(connection.accountId),
      quote: { symbol: quote.symbol, lastPrice: quote.lastPrice, updatedAt: quote.updatedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    if (message === 'BROKER_AUTH_REJECTED' && userId && provider) {
      try {
        await markBrokerConnectionStatus(userId, provider, 'EXPIRED');
      } catch {
        // Return the broker rejection even if persisting the status fails.
      }
    }
    if (message.startsWith('BROKER_PERMISSION_DENIED:') && userId && provider) {
      try {
        await markBrokerConnectionStatus(userId, provider, 'ERROR');
      } catch {
        // Return the permission error even if persisting the status fails.
      }
    }
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : message === 'RATE_LIMITED' ? 429 : 502;
    return NextResponse.json({
      error: message === 'BROKER_AUTH_REJECTED'
        ? 'Supabase row exists, but the broker rejected its token; reconnect with today\'s token'
        : message.startsWith('BROKER_PERMISSION_DENIED:')
          ? `Token is valid, but Groww denied live-market data: ${message.slice('BROKER_PERMISSION_DENIED:'.length)}`
        : message,
      rowFound: message === 'AUTHENTICATION_REQUIRED' ? undefined : true,
    }, { status });
  }
}
