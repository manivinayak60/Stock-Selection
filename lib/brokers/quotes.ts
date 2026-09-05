import type { BrokerQuote } from './types';

function percent(last: number, close: number | undefined) {
  return close && close > 0 ? Number((((last / close) - 1) * 100).toFixed(2)) : null;
}

export async function fetchKiteQuotes(symbols: string[], accessToken: string) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) throw new Error('Kite API key is not configured');
  const params = new URLSearchParams();
  symbols.forEach((symbol) => params.append('i', `NSE:${symbol}`));
  const response = await fetch(`https://api.kite.trade/quote?${params}`, {
    headers: {
      Authorization: `token ${apiKey}:${accessToken}`,
      'X-Kite-Version': '3',
    },
    cache: 'no-store',
  });
  const body = await response.json() as {
    status?: string;
    message?: string;
    data?: Record<string, {
      last_price: number;
      volume?: number;
      timestamp?: string;
      ohlc?: { close?: number };
    }>;
  };
  if (!response.ok || body.status !== 'success') throw new Error(body.message || 'Kite quote request failed');
  return Object.entries(body.data ?? {}).map(([key, quote]) => ({
    symbol: key.replace(/^NSE:/, ''),
    lastPrice: Number(quote.last_price),
    changePercent: percent(Number(quote.last_price), quote.ohlc?.close),
    volume: quote.volume ?? null,
    updatedAt: quote.timestamp ?? new Date().toISOString(),
  })) satisfies BrokerQuote[];
}

export async function fetchGrowwQuotes(symbols: string[], accessToken: string) {
  const quotes: BrokerQuote[] = [];
  for (let index = 0; index < symbols.length; index += 50) {
    const batch = symbols.slice(index, index + 50);
    const exchangeSymbols = batch.map((symbol) => `NSE_${symbol}`).join(',');
    const response = await fetch(
      `https://api.groww.in/v1/live-data/ltp?segment=CASH&exchange_symbols=${encodeURIComponent(exchangeSymbols)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'X-API-VERSION': '1.0',
        },
        cache: 'no-store',
      },
    );
    const body = await response.json() as {
      status?: string;
      message?: string;
      payload?: Record<string, number>;
    };
    if (!response.ok || body.status !== 'SUCCESS') throw new Error(body.message || 'Groww quote request failed');
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(body.payload ?? {})) {
      quotes.push({
        symbol: key.replace(/^NSE_/, ''),
        lastPrice: Number(value),
        changePercent: null,
        volume: null,
        updatedAt: now,
      });
    }
  }
  return quotes;
}
