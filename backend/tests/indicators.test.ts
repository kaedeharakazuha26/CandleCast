import test from "node:test";
import assert from "node:assert/strict";
import { computeIndicators } from "../src/services/indicators.ts";
import type { Candle } from "../src/utils/types.ts";

function series(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: i * 60_000,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100.5 + i * 0.1,
    volume: 10 + i,
  }));
}

test("RSI and EMAs populate after enough history", () => {
  const result = computeIndicators(series(220));
  assert.ok(result.latest.rsi != null);
  assert.ok(result.latest.ema200 != null);
  assert.ok(result.latest.atr != null);
  assert.ok((result.latest.rsi as number) >= 0 && (result.latest.rsi as number) <= 100);
});

test("Bollinger, MACD, VWAP and StochRSI align with the candle timestamps", () => {
  const candles = series(220);
  const result = computeIndicators(candles);

  assert.equal(result.timestamps.length, candles.length);
  assert.equal(result.bbUpper.length, candles.length);
  assert.equal(result.bbLower.length, candles.length);
  assert.equal(result.macd.length, candles.length);
  assert.equal(result.vwap.length, candles.length);
  assert.equal(result.stochRsi.length, candles.length);

  assert.ok(result.latest.bbUpper != null && result.latest.bbLower != null);
  assert.ok((result.latest.bbUpper as number) > (result.latest.bbLower as number));
  assert.ok(result.latest.macd != null && result.latest.macdSignal != null);
  assert.ok(result.latest.vwap != null);
  assert.ok(result.latest.stochRsi != null);
  assert.ok((result.latest.stochRsi as number) >= 0 && (result.latest.stochRsi as number) <= 1);
});

test("short histories return null indicators instead of fabricated values", () => {
  const result = computeIndicators(series(10));
  assert.equal(result.latest.ema200, null);
  assert.equal(result.latest.bbUpper, null);
  assert.equal(result.latest.atr, null);
  assert.equal(result.latest.rsi, null);
});
