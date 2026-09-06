import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { nextSixAmIndia, requireUserId } from '@/lib/brokers/auth';
import { saveBrokerConnection } from '@/lib/brokers/connections';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const home = new URL('/', request.url);
  try {
    const userId = await requireUserId();
    const requestToken = request.nextUrl.searchParams.get('request_token');
    const state = request.nextUrl.searchParams.get('state');
    const expectedState = request.cookies.get('kite_oauth_state')?.value;
    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;
    if (!requestToken || !state || state !== expectedState || !apiKey || !apiSecret) {
      throw new Error('Invalid Zerodha callback');
    }
    const checksum = createHash('sha256')
      .update(`${apiKey}${requestToken}${apiSecret}`)
      .digest('hex');
    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.json() as {
      status?: string;
      message?: string;
      data?: { access_token?: string; user_id?: string };
    };
    if (!response.ok || body.status !== 'success' || !body.data?.access_token) {
      throw new Error(body.message || 'Zerodha token exchange failed');
    }
    await saveBrokerConnection({
      userId,
      provider: 'KITE_CONNECT',
      accountId: body.data.user_id ?? null,
      accessToken: body.data.access_token,
      expiresAt: nextSixAmIndia().toISOString(),
    });
    home.searchParams.set('broker', 'zerodha_connected');
  } catch {
    home.searchParams.set('broker_error', 'zerodha_connection_failed');
  }
  const result = NextResponse.redirect(home);
  result.cookies.delete('kite_oauth_state');
  return result;
}
