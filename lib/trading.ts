export type ProviderMode = 'FREE_EOD' | 'KITE_CONNECT' | 'GROWW_CONNECT';

export type Settings = {
  capital: number;
  normalRisk: number;
  hardRisk: number;
  perStockRisk: number;
  maxPositions: number;
  maxSectorAllocation: number;
  provider: ProviderMode;
};

export type CandidateSnapshot = {
  symbol: string;
  name: string;
  sector: string;
  isBank: boolean;
  close: number;
  change: number;
  marketCapCr: number | null;
  debtEquity: number | null;
  opm: number | null;
  roe: number | null;
  salesGrowth: number | null;
  trend: number;
  momentum: number;
  relativeStrength: number;
  volume: number;
  regime: number;
  qualityScore: number;
  setupScore: number;
  score: number;
  status: 'Strong' | 'Qualified' | 'Watch';
  atr: number;
  setup:
    | 'Confirmed breakout'
    | 'Pullback opportunity'
    | 'Momentum continuation'
    | 'Watch for breakout';
  thesis: string;
  caution: string;
  prices: number[];
  asOfDate: string;
  evidenceStatus: 'VALID' | 'REVIEW';
  medianTurnoverLacs20: number;
  relativeVolume20: number;
  rsi14: number;
  macdHistogram: number;
  support: number;
  resistance: number;
  high52Week: number;
  livePrice?: number;
  liveChangePercent?: number | null;
  liveUpdatedAt?: string;
  liveProvider?: Exclude<ProviderMode, 'FREE_EOD'>;
  breakdown: { label: string; value: number; max: number }[];
};

export type LiveQuote = {
  symbol: string;
  lastPrice: number;
  changePercent: number | null;
  volume: number | null;
  updatedAt: string;
  provider: Exclude<ProviderMode, 'FREE_EOD'>;
};

export type BrokerConnectionStatus = {
  provider: Exclude<ProviderMode, 'FREE_EOD'>;
  configured: boolean;
  connected: boolean;
  expired: boolean;
  accountId: string | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
};

export type Opportunity = CandidateSnapshot & {
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  quantity: number;
  capitalRequired: number;
  plannedRisk: number;
  rewardRisk: number;
};

export type PaperTrade = {
  id: number;
  symbol: string;
  sector?: string;
  setup: string;
  status: string;
  entry: number;
  stop: number;
  target: number;
  quantity: number;
  openedAt: string;
  closedAt?: string | null;
  exitPrice?: number | null;
  notes?: string;
};

export const defaultSettings: Settings = {
  capital: 50_000,
  normalRisk: 5_000,
  hardRisk: 8_000,
  perStockRisk: 2_000,
  maxPositions: 5,
  maxSectorAllocation: 35,
  provider: 'FREE_EOD',
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function buildOpportunities(
  settings: Settings,
  candidates: CandidateSnapshot[] = [],
): Opportunity[] {
  return candidates
    .map((candidate) => {
      const planningPrice = candidate.livePrice ?? candidate.close;
      const stopDistance = Math.max(candidate.atr * 1.65, planningPrice * 0.032);
      const entryLow = planningPrice - candidate.atr * 0.3;
      const entryHigh = planningPrice + candidate.atr * 0.18;
      const stop = entryLow - stopDistance;
      const riskPerShare = entryHigh - stop;
      const quantity = Math.max(
        0,
        Math.min(
          Math.floor(Math.min(settings.perStockRisk, settings.hardRisk) / riskPerShare),
          Math.floor((settings.capital * (settings.maxSectorAllocation / 100)) / entryHigh),
        ),
      );
      return {
        ...candidate,
        close: planningPrice,
        entryLow: round(entryLow),
        entryHigh: round(entryHigh),
        stop: round(stop),
        target1: round(entryHigh + riskPerShare * 2),
        target2: round(entryHigh + riskPerShare * 3),
        quantity,
        capitalRequired: round(quantity * entryHigh),
        plannedRisk: round(quantity * riskPerShare),
        rewardRisk: 2,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export const performanceSeries: {
  month: string;
  strategy: number;
  benchmark: number;
}[] = [];
