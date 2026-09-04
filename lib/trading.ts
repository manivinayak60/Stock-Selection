export type ProviderMode = 'FREE_EOD' | 'KITE_CONNECT';
export type Settings = {
  capital: number;
  normalRisk: number;
  hardRisk: number;
  perStockRisk: number;
  maxPositions: number;
  maxSectorAllocation: number;
  provider: ProviderMode;
};
export type CandidateSeed = {
  symbol: string;
  name: string;
  sector: string;
  isBank: boolean;
  close: number;
  change: number;
  marketCapCr: number;
  debtEquity: number | null;
  opm: number | null;
  roe: number;
  salesGrowth: number;
  trend: number;
  momentum: number;
  relativeStrength: number;
  volume: number;
  regime: number;
  catalyst: number;
  atr: number;
  setup:
    | 'Confirmed breakout'
    | 'Pullback opportunity'
    | 'Momentum continuation'
    | 'Watch for breakout';
  thesis: string;
  caution: string;
  prices: number[];
};
export type Opportunity = CandidateSeed & {
  qualityScore: number;
  setupScore: number;
  score: number;
  status: 'Strong' | 'Qualified' | 'Watch';
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  quantity: number;
  capitalRequired: number;
  plannedRisk: number;
  rewardRisk: number;
  breakdown: { label: string; value: number; max: number }[];
};
export type MarketOverride = Partial<
  Pick<
    CandidateSeed,
    | 'close'
    | 'change'
    | 'trend'
    | 'momentum'
    | 'relativeStrength'
    | 'volume'
    | 'atr'
    | 'setup'
    | 'prices'
  >
>;
export type PaperTrade = {
  id: number;
  symbol: string;
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
  capital: 50000,
  normalRisk: 5000,
  hardRisk: 8000,
  perStockRisk: 2000,
  maxPositions: 5,
  maxSectorAllocation: 35,
  provider: 'FREE_EOD',
};

const seeds: CandidateSeed[] = [
  {
    symbol: 'CIPLA',
    name: 'Cipla Limited',
    sector: 'Pharma',
    isBank: false,
    close: 1563.4,
    change: 2.8,
    marketCapCr: 126300,
    debtEquity: 0.04,
    opm: 24.6,
    roe: 15.8,
    salesGrowth: 12.4,
    trend: 28,
    momentum: 18,
    relativeStrength: 18,
    volume: 9,
    regime: 9,
    catalyst: 7,
    atr: 32.5,
    setup: 'Confirmed breakout',
    thesis:
      'Closed above a 55-session resistance zone with broad volume participation and sector leadership.',
    caution:
      'Do not chase if the opening price removes the minimum 2:1 reward-to-risk.',
    prices: [
      1438, 1451, 1446, 1472, 1486, 1494, 1512, 1507, 1528, 1540, 1536, 1563,
    ],
  },
  {
    symbol: 'BEL',
    name: 'Bharat Electronics',
    sector: 'Capital goods',
    isBank: false,
    close: 412.75,
    change: 1.9,
    marketCapCr: 301600,
    debtEquity: 0,
    opm: 27.3,
    roe: 26.1,
    salesGrowth: 16.8,
    trend: 27,
    momentum: 17,
    relativeStrength: 18,
    volume: 8,
    regime: 9,
    catalyst: 4,
    atr: 10.4,
    setup: 'Momentum continuation',
    thesis:
      'Relative strength remains high after a controlled consolidation above rising medium-term averages.',
    caution:
      'Government-order headlines can create gaps; use the maximum-entry guard.',
    prices: [362, 369, 374, 371, 382, 388, 395, 392, 401, 406, 405, 413],
  },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank',
    sector: 'Banks',
    isBank: true,
    close: 1438.2,
    change: 1.2,
    marketCapCr: 1024000,
    debtEquity: null,
    opm: null,
    roe: 18.7,
    salesGrowth: 14.2,
    trend: 26,
    momentum: 15,
    relativeStrength: 16,
    volume: 8,
    regime: 9,
    catalyst: 4,
    atr: 31.2,
    setup: 'Pullback opportunity',
    thesis:
      'Orderly pullback into prior resistance while the bank index and asset-quality trend remain supportive.',
    caution:
      'Use the bank-specific quality model; corporate debt-to-equity and OPM gates do not apply.',
    prices: [
      1334, 1350, 1372, 1391, 1408, 1422, 1411, 1398, 1414, 1429, 1432, 1438,
    ],
  },
  {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharmaceutical',
    sector: 'Pharma',
    isBank: false,
    close: 1788.6,
    change: 0.8,
    marketCapCr: 429000,
    debtEquity: 0.03,
    opm: 28.1,
    roe: 17.9,
    salesGrowth: 10.7,
    trend: 25,
    momentum: 15,
    relativeStrength: 15,
    volume: 7,
    regime: 9,
    catalyst: 3,
    atr: 36.8,
    setup: 'Watch for breakout',
    thesis:
      'Strong primary trend, but price has not yet cleared the current consolidation ceiling.',
    caution: 'Wait for a daily close above the trigger with confirming volume.',
    prices: [
      1680, 1698, 1712, 1704, 1730, 1744, 1750, 1742, 1768, 1780, 1774, 1789,
    ],
  },
  {
    symbol: 'M&M',
    name: 'Mahindra & Mahindra',
    sector: 'Automobile',
    isBank: false,
    close: 3284.1,
    change: 1.5,
    marketCapCr: 408000,
    debtEquity: 0.12,
    opm: 14.8,
    roe: 19.2,
    salesGrowth: 15.1,
    trend: 26,
    momentum: 16,
    relativeStrength: 17,
    volume: 7,
    regime: 8,
    catalyst: 3,
    atr: 81.5,
    setup: 'Momentum continuation',
    thesis:
      'Leadership in the automobile group with constructive price compression near the high.',
    caution:
      'ATR is elevated; quantity must be reduced rather than widening the stop.',
    prices: [
      2940, 2998, 3010, 3062, 3114, 3098, 3155, 3180, 3164, 3222, 3250, 3284,
    ],
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank',
    sector: 'Banks',
    isBank: true,
    close: 972.3,
    change: 0.6,
    marketCapCr: 1485000,
    debtEquity: null,
    opm: null,
    roe: 14.6,
    salesGrowth: 11.9,
    trend: 24,
    momentum: 14,
    relativeStrength: 14,
    volume: 8,
    regime: 9,
    catalyst: 3,
    atr: 20.1,
    setup: 'Watch for breakout',
    thesis:
      'Improving bank-relative trend and stable participation, but entry trigger remains unconfirmed.',
    caution:
      'Require a decisive close above resistance; avoid anticipatory entry.',
    prices: [906, 914, 921, 930, 926, 938, 944, 948, 952, 961, 968, 972],
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    sector: 'IT',
    isBank: false,
    close: 3368.7,
    change: -0.4,
    marketCapCr: 1217000,
    debtEquity: 0.01,
    opm: 25.1,
    roe: 52.4,
    salesGrowth: 7.1,
    trend: 22,
    momentum: 12,
    relativeStrength: 11,
    volume: 6,
    regime: 6,
    catalyst: 2,
    atr: 72.3,
    setup: 'Pullback opportunity',
    thesis:
      'High-quality balance sheet and improving base, but sector-relative strength is only moderate.',
    caution:
      'Treat as watch-only until momentum recovers above the qualification threshold.',
    prices: [
      3490, 3462, 3438, 3420, 3395, 3372, 3348, 3329, 3338, 3350, 3361, 3369,
    ],
  },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Banks',
    isBank: true,
    close: 846.4,
    change: 1.1,
    marketCapCr: 755000,
    debtEquity: null,
    opm: null,
    roe: 17.2,
    salesGrowth: 12.8,
    trend: 24,
    momentum: 15,
    relativeStrength: 15,
    volume: 8,
    regime: 9,
    catalyst: 2,
    atr: 19.4,
    setup: 'Pullback opportunity',
    thesis:
      'Constructive retest with strong liquidity and supportive bank-sector breadth.',
    caution:
      'Monitor asset-quality disclosures and index concentration before entry.',
    prices: [781, 792, 804, 812, 823, 818, 826, 832, 829, 838, 842, 846],
  },
  {
    symbol: 'HINDUNILVR',
    name: 'Hindustan Unilever',
    sector: 'FMCG',
    isBank: false,
    close: 2690.5,
    change: 0.3,
    marketCapCr: 632000,
    debtEquity: 0.03,
    opm: 23.2,
    roe: 20.5,
    salesGrowth: 5.6,
    trend: 21,
    momentum: 11,
    relativeStrength: 10,
    volume: 7,
    regime: 7,
    catalyst: 2,
    atr: 49.7,
    setup: 'Watch for breakout',
    thesis:
      'Quality remains high, though momentum and relative performance are not yet sufficient.',
    caution: 'A good company is not automatically an actionable swing setup.',
    prices: [
      2608, 2630, 2648, 2627, 2650, 2662, 2678, 2669, 2681, 2685, 2688, 2691,
    ],
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
function qualityScore(seed: CandidateSeed) {
  if (seed.isBank)
    return clamp(
      round((seed.roe / 20) * 11 + (seed.salesGrowth / 16) * 9),
      0,
      20,
    );
  const debt =
    seed.debtEquity === null ? 0 : clamp(1 - seed.debtEquity, 0, 1) * 5;
  const margin = seed.opm === null ? 0 : clamp(seed.opm / 25, 0, 1) * 6;
  return round(
    debt +
      margin +
      clamp(seed.roe / 20, 0, 1) * 5 +
      clamp(seed.salesGrowth / 15, 0, 1) * 4,
  );
}

export function buildOpportunities(
  settings: Settings,
  market: Record<string, MarketOverride> = {},
): Opportunity[] {
  return seeds
    .map((baseSeed) => {
      const seed = { ...baseSeed, ...market[baseSeed.symbol] };
      const quality = qualityScore(seed);
      const score = round(
        seed.trend +
          seed.momentum +
          seed.volume +
          quality +
          seed.regime +
          seed.catalyst,
      );
      const setupScore = round(
        seed.trend +
          seed.momentum +
          seed.relativeStrength +
          seed.volume +
          seed.regime +
          seed.catalyst,
      );
      const stopDistance = Math.max(seed.atr * 1.65, seed.close * 0.032);
      const entryLow = seed.close - seed.atr * 0.3;
      const entryHigh = seed.close + seed.atr * 0.18;
      const stop = entryLow - stopDistance;
      const riskPerShare = entryHigh - stop;
      const quantity = Math.max(
        0,
        Math.min(
          Math.floor(settings.perStockRisk / riskPerShare),
          Math.floor((settings.capital * 0.28) / entryHigh),
        ),
      );
      const status: Opportunity['status'] =
        score >= 80 && seed.setup !== 'Watch for breakout'
          ? 'Strong'
          : score >= 70 && seed.setup !== 'Watch for breakout'
            ? 'Qualified'
            : 'Watch';
      return {
        ...seed,
        qualityScore: quality,
        setupScore,
        score,
        status,
        entryLow: round(entryLow),
        entryHigh: round(entryHigh),
        stop: round(stop),
        target1: round(entryHigh + riskPerShare * 2),
        target2: round(entryHigh + riskPerShare * 3),
        quantity,
        capitalRequired: round(quantity * entryHigh),
        plannedRisk: round(quantity * riskPerShare),
        rewardRisk: 2,
        breakdown: [
          { label: 'Trend & setup', value: seed.trend, max: 30 },
          { label: 'Momentum', value: seed.momentum, max: 20 },
          { label: 'Volume & liquidity', value: seed.volume, max: 10 },
          { label: 'Fundamental quality', value: quality, max: 20 },
          { label: 'Market & sector', value: seed.regime, max: 10 },
          { label: 'News & catalysts', value: seed.catalyst, max: 10 },
        ],
      };
    })
    .sort((a, b) => b.score - a.score);
}

export const performanceSeries = [
  { month: 'Apr', strategy: 0, benchmark: 0 },
  { month: 'May', strategy: 2.8, benchmark: 1.6 },
  { month: 'Jun', strategy: 4.1, benchmark: 2.4 },
  { month: 'Jul', strategy: 3.5, benchmark: 2.1 },
  { month: 'Aug', strategy: 6.7, benchmark: 4.3 },
  { month: 'Sep', strategy: 7.4, benchmark: 4.8 },
];
export const marketDate = '2026-09-03';
