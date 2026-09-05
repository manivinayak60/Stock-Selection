import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';
import { listBrokerConnections } from '@/lib/brokers/connections';
import type { LiveProvider } from '@/lib/brokers/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await requireUserId();
    const rows = await listBrokerConnections(userId);
    const now = Date.now();
    const definitions: { provider: LiveProvider; configured: boolean }[] = [
      {
        provider: 'KITE_CONNECT',
        configured: Boolean(process.env.KITE_API_KEY && process.env.KITE_API_SECRET && process.env.BROKER_TOKEN_ENCRYPTION_KEY),
      },
      {
        provider: 'GROWW_CONNECT',
        configured: Boolean(process.env.BROKER_TOKEN_ENCRYPTION_KEY),
      },
    ];
    return NextResponse.json({
      connections: definitions.map((definition) => {
        const row = rows.find((item) => item.provider === definition.provider);
        const expired = Boolean(row?.token_expires_at && Date.parse(row.token_expires_at) <= now);
        return {
          provider: definition.provider,
          configured: definition.configured,
          connected: Boolean(row && row.status === 'CONNECTED' && !expired),
          expired,
          accountId: row?.account_id ?? null,
          expiresAt: row?.token_expires_at ?? null,
          lastVerifiedAt: row?.last_verified_at ?? null,
        };
      }),
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'AUTHENTICATION_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Authentication required' : 'Unable to read broker connections' }, { status });
  }
}
