import { NextResponse } from 'next/server';

import type { MarketOverride } from '@/lib/trading';

export const dynamic = 'force-dynamic';

const symbols = [
  'CIPLA',
  'BEL',
  'ICICIBANK',
  'SUNPHARMA',
  'M&M',
  'HDFCBANK',
  'TCS',
  'SBIN',
  'HINDUNILVR',
];

type Candle = {
  close: number;
  high: number;
  low: number;
  volume: number;
  time: number;
};

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const multiplier = 2 / (period + 1);
  return values
    .slice(1)
    .reduce(
      (value, current) => current * multiplier + value * (1 - multiplier),
      values[0],
    );
}

function rsi(values: number[], period = 14) {
  const changes = values
    .slice(-period - 1)
    .slice(1)
    .map((value, index) => value - values.slice(-period - 1)[index]);
  const gains = average(changes.map((value) => Math.max(0, value)));
  const losses = average(changes.map((value) => Math.max(0, -value)));
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}

function analyze(candles: Candle[]): MarketOverride | null {
  if (candles.length < 200) return null;
  const closes = candles.map((candle) => candle.close);
  const latest = candles.at(-1)!;
  const prior = candles.at(-2)!;
  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-50));
  const sma200 = average(closes.slice(-200));
  const ema20 = ema(closes.slice(-80), 20);
  const macd = ema(closes.slice(-80), 12) - ema(closes.slice(-80), 26);
  const roc20 = (latest.close / closes.at(-21)! - 1) * 100;
  const rsi14 = rsi(closes);
  const averageVolume = average(
    candles.slice(-21, -1).map((candle) => candle.volume),
  );
  const relativeVolume = averageVolume ? latest.volume / averageVolume : 1;
  const trueRanges = candles
    .slice(-15)
    .slice(1)
    .map((candle, index) => {
      const previousClose = candles.slice(-15)[index].close;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
    });
  const atr = average(trueRanges);
  const prior20High = Math.max(
    ...candles.slice(-21, -1).map((candle) => candle.high),
  );
  let trend = 0;
  if (latest.close > ema20) trend += 6;
  if (latest.close > sma50) trend += 8;
  if (latest.close > sma200) trend += 8;
  if (sma20 > sma50) trend += 4;
  if (latest.close >= prior20High * 0.995) trend += 4;
  let momentum = 0;
  if (rsi14 >= 55 && rsi14 <= 72) momentum += 8;
  else if (rsi14 > 50) momentum += 5;
  if (macd > 0) momentum += 6;
  if (roc20 > 0) momentum += 6;
  const volume = Math.min(10, Math.max(3, relativeVolume * 6));
  let setup: MarketOverride['setup'] = 'Watch for breakout';
  if (latest.close >= prior20High && relativeVolume >= 1.15)
    setup = 'Confirmed breakout';
  else if (latest.close > sma50 && Math.abs(latest.close / ema20 - 1) < 0.025)
    setup = 'Pullback opportunity';
  else if (trend >= 22 && momentum >= 14) setup = 'Momentum continuation';
  return {
    close: Number(latest.close.toFixed(2)),
    change: Number(((latest.close / prior.close - 1) * 100).toFixed(2)),
    trend,
    momentum,
    relativeStrength: Math.min(
      20,
      Math.max(5, momentum + Math.max(0, roc20) / 4),
    ),
    volume: Number(volume.toFixed(1)),
    atr: Number(atr.toFixed(2)),
    setup,
    prices: closes.slice(-12).map((value) => Number(value.toFixed(2))),
  };
}

async function fetchSymbol(symbol: string) {
  const encoded = encodeURIComponent(`${symbol}.NS`);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1y&interval=1d&events=div%2Csplits`,
    {
      headers: { accept: 'application/json', 'user-agent': 'SwingSignal/1.0' },
    },
  );
  if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
  const payload = (await response.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: {
            close?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            volume?: (number | null)[];
          }[];
        };
      }[];
    };
  };
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const candles: Candle[] = (result?.timestamp ?? []).flatMap((time, index) => {
    const close = quote?.close?.[index];
    const high = quote?.high?.[index];
    const low = quote?.low?.[index];
    const volume = quote?.volume?.[index];
    return close && high && low && volume
      ? [{ time, close, high, low, volume }]
      : [];
  });
  return {
    symbol,
    override: analyze(candles),
    asOf: candles.at(-1)?.time ?? null,
  };
}

export async function GET() {
  const settled = await Promise.allSettled(symbols.map(fetchSymbol));
  const market: Record<string, MarketOverride> = {};
  let latestTimestamp = 0;
  const failures: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.override) {
      market[result.value.symbol] = result.value.override;
      latestTimestamp = Math.max(latestTimestamp, result.value.asOf ?? 0);
    } else failures.push(symbols[index]);
  });
  if (!Object.keys(market).length)
    return NextResponse.json(
      { error: 'Live EOD source unavailable; using last-good snapshot.' },
      { status: 503 },
    );
  return NextResponse.json({
    market,
    asOf: latestTimestamp
      ? new Date(latestTimestamp * 1000).toISOString().slice(0, 10)
      : null,
    failures,
    source: 'Free EOD market adapter',
  });
}
