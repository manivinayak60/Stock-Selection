import { NextResponse } from 'next/server';

import { nextSixAmIndia, requireUserId } from '@/lib/brokers/auth';
import { saveBrokerConnection } from '@/lib/brokers/connections';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    if (!process.env.BROKER_TOKEN_ENCRYPTION_KEY) {
      return NextResponse.json({ error: 'Broker token encryption is not configured' }, { status: 503 });
    }
    const body = await request.json() as { accessToken?: unknown };
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    if (accessToken.length < 20 || accessToken.length > 4096) {
      return NextResponse.json({ error: 'Enter a valid Groww access token' }, { status: 400 });
    }
    const validation = await fetch('https://api.groww.in/v1/user/detail', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-API-VERSION': '1.0',
      },
      cache: 'no-store',
    });
    const result = await validation.json() as {
      status?: string;
      message?: string;
      payload?: { user_id?: string; client_id?: string };
    };
    if (!validation.ok || result.status !== 'SUCCESS') {
      return NextResponse.json({ error: result.message || 'Groww rejected this access token' }, { status: 400 });
    }
    await saveBrokerConnection({
      userId,
      provider: 'GROWW_CONNECT',
      accountId: result.payload?.user_id ?? result.payload?.client_id ?? null,
      accessToken,
      expiresAt: nextSixAmIndia().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Authentication required' : 'Unable to connect Groww' }, { status });
  }
}
