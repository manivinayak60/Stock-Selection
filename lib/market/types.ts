export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnoverLacs: number;
  trades?: number | null;
  deliveryPercent?: number | null;
};

export type Instrument = {
  symbol: string;
  companyName: string;
  industry: string;
  series: string;
  isin: string;
  isBank: boolean;
};

export type FundamentalSnapshot = {
  symbol: string;
  asOfDate: string;
  marketCapCr: number;
  debtEquity: number | null;
  opm: number | null;
  roe: number | null;
  salesGrowth: number | null;
  capitalAdequacy?: number | null;
  grossNpa?: number | null;
  netNpa?: number | null;
  sourceName: string;
  sourceUrl?: string | null;
};

export type TechnicalSnapshot = {
  asOfDate: string;
  close: number;
  change: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema20: number;
  rsi14: number;
  atr14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  roc20: number;
  roc63: number;
  relativeStrength63: number;
  relativeVolume20: number;
  medianTurnoverLacs20: number;
  prior20High: number;
  high52Week: number;
  breakout20: boolean;
  prices: number[];
};

export type MarketRegime = {
  label: 'Bullish' | 'Neutral' | 'Defensive' | 'Unknown';
  score: number;
  benchmarkClose: number;
  benchmarkSma50: number;
  benchmarkSma200: number;
  breadthAboveSma50: number;
};
