import type { Candle } from "../utils/types.js";

function ema(values: number[], period: number): Array<number | null> {
  const k = 2 / (period + 1);
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function trueRange(candles: Candle[], i: number): number {
  if (i === 0) return candles[0].high - candles[0].low;
  const prevClose = candles[i - 1].close;
  return Math.max(
    candles[i].high - candles[i].low,
    Math.abs(candles[i].high - prevClose),
    Math.abs(candles[i].low - prevClose),
  );
}

export type IndicatorSeries = {
  timestamps: number[];
  rsi: Array<number | null>;
  macd: Array<number | null>;
  macdSignal: Array<number | null>;
  macdHist: Array<number | null>;
  ema9: Array<number | null>;
  ema20: Array<number | null>;
  ema50: Array<number | null>;
  ema200: Array<number | null>;
  sma20: Array<number | null>;
  bbUpper: Array<number | null>;
  bbMid: Array<number | null>;
  bbLower: Array<number | null>;
  atr: Array<number | null>;
  vwap: Array<number | null>;
  stochRsi: Array<number | null>;
  latest: Record<string, number | null>;
};

export function computeIndicators(candles: Candle[]): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const timestamps = candles.map((c) => c.timestamp);
  const ema9 = ema(closes, 9);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const sma20 = sma(closes, 20);
  const rsi14 = rsi(closes, 14);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? (ema12[i] as number) - (ema26[i] as number) : null,
  );
  const macdNumeric = macd.map((v) => v ?? 0);
  const macdSignal = ema(macdNumeric, 9).map((v, i) => (macd[i] == null ? null : v));
  const macdHist = macd.map((v, i) => (v != null && macdSignal[i] != null ? v - (macdSignal[i] as number) : null));

  const bbMid = sma20;
  const bbUpper: Array<number | null> = Array(candles.length).fill(null);
  const bbLower: Array<number | null> = Array(candles.length).fill(null);
  for (let i = 19; i < candles.length; i += 1) {
    const slice = closes.slice(i - 19, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / 20;
    const std = Math.sqrt(variance);
    bbUpper[i] = mean + 2 * std;
    bbLower[i] = mean - 2 * std;
  }

  const atr: Array<number | null> = Array(candles.length).fill(null);
  if (candles.length >= 15) {
    let acc = 0;
    for (let i = 1; i <= 14; i += 1) acc += trueRange(candles, i);
    atr[14] = acc / 14;
    for (let i = 15; i < candles.length; i += 1) {
      atr[i] = (((atr[i - 1] as number) * 13) + trueRange(candles, i)) / 14;
    }
  }

  const vwap: Array<number | null> = Array(candles.length).fill(null);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    pv += typical * candles[i].volume;
    vol += candles[i].volume;
    vwap[i] = vol === 0 ? null : pv / vol;
  }

  const rsiValues = rsi14.map((v) => v ?? 0);
  const stochRsi: Array<number | null> = Array(candles.length).fill(null);
  const period = 14;
  for (let i = period * 2; i < candles.length; i += 1) {
    const window = rsi14.slice(i - period + 1, i + 1).filter((v): v is number => v != null);
    if (window.length < period) continue;
    const min = Math.min(...window);
    const max = Math.max(...window);
    const current = rsi14[i];
    if (current == null || max === min) {
      stochRsi[i] = 0;
    } else {
      stochRsi[i] = (current - min) / (max - min);
    }
  }

  const last = <T,>(arr: Array<T | null>): T | null => {
    for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] != null) return arr[i];
    return null;
  };

  return {
    timestamps,
    rsi: rsi14,
    macd,
    macdSignal,
    macdHist,
    ema9,
    ema20,
    ema50,
    ema200,
    sma20,
    bbUpper,
    bbMid,
    bbLower,
    atr,
    vwap,
    stochRsi,
    latest: {
      rsi: last(rsi14),
      macd: last(macd),
      macdSignal: last(macdSignal),
      ema9: last(ema9),
      ema20: last(ema20),
      ema50: last(ema50),
      ema200: last(ema200),
      sma20: last(sma20),
      atr: last(atr),
      vwap: last(vwap),
      stochRsi: last(stochRsi),
      bbUpper: last(bbUpper),
      bbLower: last(bbLower),
    },
  };
}
