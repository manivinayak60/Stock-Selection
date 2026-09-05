import type { CandidateSnapshot } from '@/lib/trading';

import type {
  FundamentalSnapshot,
  Instrument,
  MarketRegime,
  TechnicalSnapshot,
} from './types';

export const MIN_MEDIAN_TURNOVER_LACS = 500;
export const MIN_MARKET_CAP_CR = 5_000;
export const MAX_FUNDAMENTAL_AGE_DAYS = 190;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function ageInDays(asOfDate: string, marketDate: string) {
  return Math.floor(
    (Date.parse(`${marketDate}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) /
      86_400_000,
  );
}

function fundamentalScore(
  instrument: Instrument,
  fundamental: FundamentalSnapshot | undefined,
  marketDate: string,
) {
  if (!fundamental) {
    return { score: 0, valid: false, reason: 'Fundamental snapshot is missing' };
  }
  if (ageInDays(fundamental.asOfDate, marketDate) > MAX_FUNDAMENTAL_AGE_DAYS) {
    return { score: 0, valid: false, reason: 'Fundamental snapshot is stale' };
  }
  if (fundamental.marketCapCr < MIN_MARKET_CAP_CR) {
    return { score: 0, valid: false, reason: 'Market capitalisation is below ₹5,000 crore' };
  }

  const roe = fundamental.roe ?? Number.NEGATIVE_INFINITY;
  const growth = fundamental.salesGrowth ?? Number.NEGATIVE_INFINITY;
  if (instrument.isBank) {
    const valid = roe >= 10 && growth > -5;
    const score =
      clamp(fundamental.marketCapCr / 100_000, 0, 1) * 6 +
      clamp(roe / 20, 0, 1) * 8 +
      clamp((growth + 5) / 20, 0, 1) * 6;
    return {
      score: round(score),
      valid,
      reason: valid ? null : 'Bank ROE or growth quality gate failed',
    };
  }

  const debtEquity = fundamental.debtEquity;
  const opm = fundamental.opm;
  const valid =
    debtEquity !== null && debtEquity <= 1 && opm !== null && opm >= 10 &&
    roe >= 10 && growth > -5;
  const score =
    clamp(1 - (debtEquity ?? 2) / 1.5, 0, 1) * 5 +
    clamp((opm ?? 0) / 25, 0, 1) * 5 +
    clamp(roe / 20, 0, 1) * 5 +
    clamp((growth + 5) / 20, 0, 1) * 5;
  return {
    score: round(score),
    valid,
    reason: valid ? null : 'Debt, operating margin, ROE, or growth gate failed',
  };
}

export function scoreCandidate(
  instrument: Instrument,
  technical: TechnicalSnapshot,
  fundamental: FundamentalSnapshot | undefined,
  regime: MarketRegime,
): CandidateSnapshot {
  let trend = 0;
  if (technical.close > technical.ema20) trend += 5;
  if (technical.close > technical.sma50) trend += 7;
  if (technical.close > technical.sma200) trend += 8;
  if (technical.sma20 > technical.sma50) trend += 5;

  let momentum = 0;
  if (technical.rsi14 >= 52 && technical.rsi14 <= 70) momentum += 6;
  else if (technical.rsi14 > 48 && technical.rsi14 < 75) momentum += 3;
  if (technical.macd > technical.macdSignal && technical.macdHistogram > 0) momentum += 6;
  if (technical.roc20 > 0) momentum += 3;

  let relativeStrength = 0;
  if (technical.relativeStrength63 > 0) relativeStrength += 8;
  if (technical.relativeStrength63 >= 5) relativeStrength += 4;
  if (technical.roc63 > 0) relativeStrength += 3;

  const volume =
    clamp((technical.relativeVolume20 - 0.7) / 1.3, 0, 1) * 5 +
    clamp(technical.medianTurnoverLacs20 / 2_000, 0, 1) * 5;

  const nearBreakout =
    technical.close >= technical.prior20High * 0.985 &&
    technical.close <= technical.prior20High;
  const pullback =
    technical.close > technical.sma50 &&
    Math.abs(technical.close / technical.ema20 - 1) <= 0.025;
  const setupPoints = technical.breakout20 ? 5 : pullback ? 4 : nearBreakout ? 3 : 0;
  const setup = technical.breakout20
    ? 'Confirmed breakout'
    : pullback
      ? 'Pullback opportunity'
      : trend >= 20 && momentum >= 9
        ? 'Momentum continuation'
        : 'Watch for breakout';

  const quality = fundamentalScore(instrument, fundamental, technical.asOfDate);
  const liquidityValid =
    technical.medianTurnoverLacs20 >= MIN_MEDIAN_TURNOVER_LACS;
  const technicalValid =
    technical.close > technical.sma50 &&
    technical.close > technical.sma200 &&
    technical.rsi14 < 75 &&
    technical.atr14 > 0 &&
    setup !== 'Watch for breakout';
  const regimeValid = regime.label !== 'Defensive' && regime.label !== 'Unknown';
  const score = round(
    trend + momentum + relativeStrength + volume + setupPoints + quality.score + regime.score,
  );
  const eligible = liquidityValid && technicalValid && quality.valid && regimeValid;
  const status: CandidateSnapshot['status'] =
    eligible && score >= 80 ? 'Strong' : eligible && score >= 70 ? 'Qualified' : 'Watch';
  const reasons = [
    !liquidityValid ? '20-day median turnover is below ₹5 crore' : null,
    !technicalValid ? 'Technical confirmation gate is incomplete' : null,
    !regimeValid ? `Market regime is ${regime.label.toLowerCase()}` : null,
    quality.reason,
  ].filter(Boolean) as string[];

  return {
    symbol: instrument.symbol,
    name: instrument.companyName,
    sector: instrument.industry,
    isBank: instrument.isBank,
    close: technical.close,
    change: technical.change,
    marketCapCr: fundamental?.marketCapCr ?? null,
    debtEquity: fundamental?.debtEquity ?? null,
    opm: fundamental?.opm ?? null,
    roe: fundamental?.roe ?? null,
    salesGrowth: fundamental?.salesGrowth ?? null,
    trend: round(trend),
    momentum: round(momentum),
    relativeStrength: round(relativeStrength),
    volume: round(volume),
    regime: regime.score,
    qualityScore: quality.score,
    setupScore: round(trend + momentum + relativeStrength + volume + setupPoints + regime.score),
    score,
    status,
    atr: technical.atr14,
    setup,
    thesis: `${setup}; RSI ${technical.rsi14.toFixed(1)}, 63-session relative performance ${technical.relativeStrength63.toFixed(1)}%, and ${technical.relativeVolume20.toFixed(1)}× relative volume.`,
    caution: reasons.length
      ? reasons.join('. ')
      : 'Confirm the opening price remains inside the entry guard before taking a paper trade.',
    prices: technical.prices,
    asOfDate: technical.asOfDate,
    evidenceStatus: reasons.length ? 'REVIEW' : 'VALID',
    medianTurnoverLacs20: technical.medianTurnoverLacs20,
    relativeVolume20: technical.relativeVolume20,
    rsi14: technical.rsi14,
    macdHistogram: technical.macdHistogram,
    support: technical.support20,
    resistance: technical.prior20High,
    high52Week: technical.high52Week,
    breakdown: [
      { label: 'Trend', value: round(trend), max: 25 },
      { label: 'Momentum', value: round(momentum), max: 15 },
      { label: 'Relative strength', value: round(relativeStrength), max: 15 },
      { label: 'Volume & liquidity', value: round(volume), max: 10 },
      { label: 'Fundamental quality', value: quality.score, max: 20 },
      { label: 'Market regime', value: regime.score, max: 10 },
      { label: 'Setup confirmation', value: setupPoints, max: 5 },
    ],
  };
}
