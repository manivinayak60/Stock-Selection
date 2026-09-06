import type { Candle, MarketRegime, TechnicalSnapshot } from './types';

const round = (value: number, digits = 4) => Number(value.toFixed(digits));

export function appendCandle(history: Candle[], candle: Candle, limit = 260) {
  const withoutSameDate = history.filter((item) => item.date !== candle.date);
  return [...withoutSameDate, candle]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);
}

export function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : Number.NaN;
}

export function median(values: number[]) {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function sma(values: number[], period: number) {
  return values.length >= period
    ? average(values.slice(-period))
    : Number.NaN;
}

export function emaSeries(values: number[], period: number) {
  const output = Array<number>(values.length).fill(Number.NaN);
  if (values.length < period) return output;
  const multiplier = 2 / (period + 1);
  let current = average(values.slice(0, period));
  output[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = values[index] * multiplier + current * (1 - multiplier);
    output[index] = current;
  }
  return output;
}

export function rsiWilder(values: number[], period = 14) {
  if (values.length <= period) return Number.NaN;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let averageGain = average(changes.slice(0, period).map((value) => Math.max(value, 0)));
  let averageLoss = average(changes.slice(0, period).map((value) => Math.max(-value, 0)));
  for (let index = period; index < changes.length; index += 1) {
    averageGain = (averageGain * (period - 1) + Math.max(changes[index], 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-changes[index], 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function atrWilder(candles: Candle[], period = 14) {
  if (candles.length <= period) return Number.NaN;
  const ranges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  let current = average(ranges.slice(0, period));
  for (let index = period; index < ranges.length; index += 1) {
    current = (current * (period - 1) + ranges[index]) / period;
  }
  return current;
}

export function calculateTechnicalSnapshot(
  candles: Candle[],
  benchmarkCandles: Candle[],
): TechnicalSnapshot | null {
  if (candles.length < 200 || benchmarkCandles.length < 64) return null;
  const closes = candles.map((item) => item.close);
  const latest = candles.at(-1)!;
  const previous = candles.at(-2)!;
  const relativeStart = candles.at(-64)!;
  const benchmarkByDate = new Map(
    benchmarkCandles.map((item) => [item.date, item.close]),
  );
  const benchmarkLatest = benchmarkByDate.get(latest.date);
  const benchmarkStart = benchmarkByDate.get(relativeStart.date);
  if (benchmarkLatest === undefined || benchmarkStart === undefined) return null;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdValues = closes.flatMap((_, index) =>
    Number.isFinite(ema12[index]) && Number.isFinite(ema26[index])
      ? [ema12[index] - ema26[index]]
      : [],
  );
  const signalValues = emaSeries(macdValues, 9);
  const macd = macdValues.at(-1)!;
  const macdSignal = signalValues.at(-1)!;
  const priorVolumes = candles.slice(-21, -1).map((item) => item.volume);
  const prior20High = Math.max(...candles.slice(-21, -1).map((item) => item.high));
  const support20 = Math.min(...candles.slice(-20).map((item) => item.low));
  const roc20 = (latest.close / closes.at(-21)! - 1) * 100;
  const roc63 = (latest.close / closes.at(-64)! - 1) * 100;
  const benchmarkRoc63 = (benchmarkLatest / benchmarkStart - 1) * 100;
  const corporateActionGap = candles.slice(-200).some((candle, index, recent) => {
    if (index === 0) return false;
    const priorClose = recent[index - 1].close;
    return priorClose > 0 && Math.abs(candle.close / priorClose - 1) >= 0.35;
  });

  return {
    asOfDate: latest.date,
    close: latest.close,
    change: round((latest.close / previous.close - 1) * 100, 2),
    sma20: round(sma(closes, 20)),
    sma50: round(sma(closes, 50)),
    sma200: round(sma(closes, 200)),
    ema20: round(emaSeries(closes, 20).at(-1)!),
    rsi14: round(rsiWilder(closes), 2),
    atr14: round(atrWilder(candles)),
    macd: round(macd),
    macdSignal: round(macdSignal),
    macdHistogram: round(macd - macdSignal),
    roc20: round(roc20, 2),
    roc63: round(roc63, 2),
    relativeStrength63: round(roc63 - benchmarkRoc63, 2),
    relativeVolume20: round(latest.volume / average(priorVolumes), 2),
    medianTurnoverLacs20: round(
      median(candles.slice(-20).map((item) => item.turnoverLacs)),
      2,
    ),
    prior20High: round(prior20High),
    high52Week: round(Math.max(...candles.slice(-252).map((item) => item.high))),
    corporateActionGap,
    support20: round(support20),
    breakout20: latest.close > prior20High,
    prices: closes.slice(-12).map((value) => round(value, 2)),
  };
}

export function calculateMarketRegime(
  benchmarkCandles: Candle[],
  stockSnapshots: TechnicalSnapshot[],
): MarketRegime {
  if (benchmarkCandles.length < 200 || !stockSnapshots.length) {
    return {
      label: 'Unknown' as const,
      score: 0,
      benchmarkClose: 0,
      benchmarkSma50: 0,
      benchmarkSma200: 0,
      breadthAboveSma50: 0,
    };
  }
  const closes = benchmarkCandles.map((item) => item.close);
  const benchmarkClose = closes.at(-1)!;
  const benchmarkSma50 = sma(closes, 50);
  const benchmarkSma200 = sma(closes, 200);
  const breadth =
    (stockSnapshots.filter((item) => item.close > item.sma50).length /
      stockSnapshots.length) *
    100;
  let score = 0;
  if (benchmarkClose > benchmarkSma50) score += 4;
  if (benchmarkClose > benchmarkSma200) score += 4;
  if (breadth >= 55) score += 2;
  const label = score >= 8 ? 'Bullish' : score >= 4 ? 'Neutral' : 'Defensive';
  return {
    label,
    score,
    benchmarkClose: round(benchmarkClose, 2),
    benchmarkSma50: round(benchmarkSma50, 2),
    benchmarkSma200: round(benchmarkSma200, 2),
    breadthAboveSma50: round(breadth, 1),
  };
}
