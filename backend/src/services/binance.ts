import axios from "axios";
import { config, DEFAULT_SYMBOLS, TIMEFRAMES, type Timeframe } from "../config.js";
import { cacheGet, cacheSet } from "./cache.js";
import type { Candle, Ticker } from "../utils/types.js";

const client = axios.create({
  baseURL: config.binanceRest,
  timeout: 15_000,
});

export async function listSymbols(): Promise<string[]> {
  const cached = await cacheGet("symbols");
  if (cached) return JSON.parse(cached) as string[];
  const { data } = await client.get("/api/v3/exchangeInfo");
  const symbols = (data.symbols as Array<{ symbol: string; status: string; quoteAsset: string }>)
    // The rest of the app (streams, tickers, forecasts) expects ASCII tickers.
    .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT" && /^[A-Z0-9]{5,20}$/.test(s.symbol))
    .map((s) => s.symbol)
    .sort((a, b) => {
      const rank = (s: string) => {
        const i = DEFAULT_SYMBOLS.indexOf(s);
        return i === -1 ? 999 : i;
      };
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  await cacheSet("symbols", JSON.stringify(symbols), 3600);
  return symbols;
}

export async function getTicker(symbol: string): Promise<Ticker> {
  const { data } = await client.get("/api/v3/ticker/24hr", { params: { symbol } });
  return {
    symbol: data.symbol,
    price: Number(data.lastPrice),
    change24h: Number(data.priceChangePercent),
    high24h: Number(data.highPrice),
    low24h: Number(data.lowPrice),
    volume24h: Number(data.volume),
    quoteVolume24h: Number(data.quoteVolume),
  };
}

export async function getTickers(symbols: string[]): Promise<Ticker[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))].filter((s) => /^[A-Z0-9]{5,20}$/.test(s));
  const cacheKey = `tickers:${unique.sort().join(",")}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as Ticker[];
  const settled = await Promise.all(
    unique.map(async (symbol) => {
      try {
        return await getTicker(symbol);
      } catch {
        return null;
      }
    }),
  );
  const tickers = settled.filter((t): t is Ticker => t != null);
  await cacheSet(cacheKey, JSON.stringify(tickers), 10);
  return tickers;
}

/**
 * Every tradable USDT pair in one upstream call, ranked by 24h quote volume.
 * Used for market-wide rankings (gainers, losers, most active).
 */
export async function getAllTickers(): Promise<Ticker[]> {
  const cached = await cacheGet("tickers:all");
  if (cached) return JSON.parse(cached) as Ticker[];

  const [allowed, { data }] = await Promise.all([
    listSymbols(),
    client.get("/api/v3/ticker/24hr"),
  ]);
  const tradable = new Set(allowed);
  const tickers = (data as Array<Record<string, string>>)
    .filter((row) => tradable.has(row.symbol))
    .map((row) => ({
      symbol: row.symbol,
      price: Number(row.lastPrice),
      change24h: Number(row.priceChangePercent),
      high24h: Number(row.highPrice),
      low24h: Number(row.lowPrice),
      volume24h: Number(row.volume),
      quoteVolume24h: Number(row.quoteVolume),
    }))
    .filter((t) => Number.isFinite(t.price) && t.price > 0)
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

  await cacheSet("tickers:all", JSON.stringify(tickers), 20);
  return tickers;
}

export async function getKlines(symbol: string, timeframe: Timeframe, limit = 1000): Promise<Candle[]> {
  const tf = TIMEFRAMES[timeframe];
  const cacheKey = `klines:${symbol}:${timeframe}:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as Candle[];

  const { data } = await client.get("/api/v3/klines", {
    params: { symbol, interval: tf.binance, limit },
  });
  const candles: Candle[] = (data as unknown[][]).map((row) => ({
    timestamp: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    amount: Number(row[7]),
  }));
  await cacheSet(cacheKey, JSON.stringify(candles), timeframe === "1m" ? 5 : 15);
  return candles;
}

export async function getKlinesRange(
  symbol: string,
  timeframe: Timeframe,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  const tf = TIMEFRAMES[timeframe];
  const out: Candle[] = [];
  let cursor = startTime;
  while (cursor < endTime && out.length < 5000) {
    const { data } = await client.get("/api/v3/klines", {
      params: { symbol, interval: tf.binance, startTime: cursor, endTime, limit: 1000 },
    });
    const batch = data as unknown[][];
    if (!batch.length) break;
    for (const row of batch) {
      out.push({
        timestamp: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        amount: Number(row[7]),
      });
    }
    const last = Number(batch[batch.length - 1][0]);
    cursor = last + tf.ms;
    if (batch.length < 1000) break;
  }
  return out;
}
