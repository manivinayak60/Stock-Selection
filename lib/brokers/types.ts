import type { ProviderMode } from '@/lib/trading';

export type LiveProvider = Exclude<ProviderMode, 'FREE_EOD'>;

export type StoredBrokerConnection = {
  provider: LiveProvider;
  accountId: string | null;
  accessToken: string;
  expiresAt: string | null;
  status: 'CONNECTED' | 'EXPIRED' | 'ERROR';
  lastVerifiedAt: string | null;
};

export type BrokerQuote = {
  symbol: string;
  lastPrice: number;
  changePercent: number | null;
  volume: number | null;
  updatedAt: string;
};
