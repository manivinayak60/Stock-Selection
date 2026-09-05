import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';
import { disconnectBroker } from '@/lib/brokers/connections';
import type { LiveProvider } from '@/lib/brokers/types';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json() as { provider?: unknown };
    const provider = body.provider;
    if (provider !== 'KITE_CONNECT' && provider !== 'GROWW_CONNECT') {
      return NextResponse.json({ error: 'Invalid broker provider' }, { status: 400 });
    }
    await disconnectBroker(userId, provider as LiveProvider);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Authentication required' : 'Unable to disconnect broker' }, { status });
  }
}
