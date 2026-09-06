import { createAdminClient } from '@/lib/supabase/admin';

import { decryptToken, encryptToken } from './crypto';
import type { LiveProvider, StoredBrokerConnection } from './types';

type ConnectionRow = {
  provider: LiveProvider;
  account_id: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  status: StoredBrokerConnection['status'];
  last_verified_at: string | null;
};

export async function saveBrokerConnection(input: {
  userId: string;
  provider: LiveProvider;
  accountId?: string | null;
  accessToken: string;
  expiresAt?: string | null;
}) {
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from('broker_connections').upsert({
    user_id: input.userId,
    provider: input.provider,
    account_id: input.accountId ?? null,
    access_token_encrypted: encryptToken(input.accessToken),
    token_expires_at: input.expiresAt ?? null,
    status: 'CONNECTED',
    last_verified_at: now,
    updated_at: now,
  }, { onConflict: 'user_id,provider' });
  if (error) throw new Error(error.message);
}

export async function getBrokerConnection(userId: string, provider: LiveProvider) {
  const { data, error } = await createAdminClient()
    .from('broker_connections')
    .select('provider,account_id,access_token_encrypted,token_expires_at,status,last_verified_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle<ConnectionRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    provider: data.provider,
    accountId: data.account_id,
    accessToken: decryptToken(data.access_token_encrypted),
    expiresAt: data.token_expires_at,
    status: data.status,
    lastVerifiedAt: data.last_verified_at,
  } satisfies StoredBrokerConnection;
}

export async function listBrokerConnections(userId: string) {
  const { data, error } = await createAdminClient()
    .from('broker_connections')
    .select('provider,account_id,token_expires_at,status,last_verified_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function disconnectBroker(userId: string, provider: LiveProvider) {
  const { error } = await createAdminClient()
    .from('broker_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) throw new Error(error.message);
}

export async function markBrokerConnectionStatus(
  userId: string,
  provider: LiveProvider,
  status: StoredBrokerConnection['status'],
) {
  const { error } = await createAdminClient()
    .from('broker_connections')
    .update({ status, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) throw new Error(error.message);
}
