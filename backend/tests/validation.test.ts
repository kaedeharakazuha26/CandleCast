import test from "node:test";
import assert from "node:assert/strict";
import { assertForecastCandles } from "../src/services/validation.ts";
import type { Candle } from "../src/utils/types.ts";

const TF = 60_000;
const ORIGIN = 1_700_000_000_000;

function forecast(overrides: Partial<Candle>[] = []): Candle[] {
  return [0, 1, 2].map((i) => ({
    timestamp: ORIGIN + TF * (i + 1),
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 10 + i,
    ...(overrides[i] ?? {}),
  }));
}

test("accepts a well-formed forecast that starts after the context", () => {
  assert.doesNotThrow(() => assertForecastCandles(forecast(), TF, ORIGIN));
});

test("rejects an empty forecast", () => {
  assert.throws(() => assertForecastCandles([], TF, ORIGIN), /no candles/);
});

test("rejects a candle that overlaps the inference context", () => {
  const candles = forecast([{ timestamp: ORIGIN }]);
  assert.throws(() => assertForecastCandles(candles, TF, ORIGIN), /overlaps/);
});

test("rejects irregular timestamp spacing", () => {
  const candles = forecast([{}, {}, { timestamp: ORIGIN + TF * 4 }]);
  assert.throws(() => assertForecastCandles(candles, TF, ORIGIN), /not spaced/);
});

test("rejects high below open/close", () => {
  const candles = forecast([{ high: 100.5 }]);
  assert.throws(() => assertForecastCandles(candles, TF, ORIGIN), /high below/);
});

test("rejects low above open/close", () => {
  const candles = forecast([{ low: 100.5 }]);
  assert.throws(() => assertForecastCandles(candles, TF, ORIGIN), /low above/);
});

test("rejects negative volume", () => {
  const candles = forecast([{ volume: -1 }]);
  assert.throws(() => assertForecastCandles(candles, TF, ORIGIN), /negative volume/);
});

test("rejects non-finite values", () => {
  const candles = forecast([{ close: Number.NaN }]);
  assert.throws(() => assertForecastCandles(candles, TF, ORIGIN), /non-finite/);
});
