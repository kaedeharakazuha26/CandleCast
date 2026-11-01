import test from "node:test";
import assert from "node:assert/strict";
import { averageMetrics, computeMetrics } from "../src/services/metrics.ts";
import type { Candle } from "../src/utils/types.ts";

function candle(
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  timestamp = 0,
): Candle {
  return { timestamp, open, high, low, close, volume };
}

test("computeMetrics matches hand-computed MAE, RMSE, MAPE and direction", () => {
  const predicted = [
    candle(100, 110, 99, 108, 10),
    candle(108, 112, 105, 106, 12),
  ];
  const actual = [candle(100, 109, 98, 106, 9), candle(106, 107, 100, 101, 8)];

  const metrics = computeMetrics(predicted, actual, 100);

  assert.equal(metrics.n, 2);
  assert.equal(metrics.mae.open, 1);
  assert.equal(metrics.mae.high, 3);
  assert.equal(metrics.mae.low, 3);
  assert.equal(metrics.mae.close, 3.5);
  assert.equal(metrics.mae.volume, 2.5);
  assert.ok(Math.abs(metrics.rmse.close - Math.sqrt(14.5)) < 1e-12);
  assert.ok(Math.abs((metrics.mape.close as number) - 3.418643751) < 1e-6);
  assert.equal(metrics.directional_accuracy, 1);
  assert.equal(metrics.predicted_trend, "Bullish");
  assert.equal(metrics.actual_trend, "Bullish");
  assert.equal(metrics.trend_directional_accuracy, 1);
  assert.equal(metrics.close_price_error, metrics.mae.close);
});

test("trend accuracy records a miss when the horizon direction differs", () => {
  const predicted = [candle(98, 99.5, 97, 99, 1)];
  const actual = [candle(99, 106, 98, 105, 1)];
  const metrics = computeMetrics(predicted, actual, 100);

  assert.equal(metrics.predicted_trend, "Bearish");
  assert.equal(metrics.actual_trend, "Bullish");
  assert.equal(metrics.trend_directional_accuracy, 0);
  assert.equal(metrics.directional_accuracy, 1, "body directions still agree");
});

test("a flat realized horizon is excluded from trend accuracy", () => {
  const metrics = computeMetrics(
    [candle(100, 101, 99, 100, 1)],
    [candle(100, 101, 99, 100, 1)],
    100,
  );
  assert.equal(metrics.actual_trend, "Flat");
  assert.equal(metrics.trend_directional_accuracy, null);
});

test("computeMetrics rejects empty overlap", () => {
  assert.throws(() => computeMetrics([], []), /No overlapping/);
});

test("averageMetrics groups runs and separates bullish and bearish windows", () => {
  const up = computeMetrics(
    [candle(100, 112, 99, 111, 5)],
    [candle(100, 111, 99, 110, 4)],
    100,
  );
  const downHit = computeMetrics(
    [candle(100, 101, 88, 89, 5)],
    [candle(100, 93, 87, 88, 4)],
    100,
  );

  const average = averageMetrics([up, downHit]);
  assert.equal(average?.runs, 2);
  assert.equal(average?.candles, 2);
  assert.equal(average?.bullish_windows, 1);
  assert.equal(average?.bearish_windows, 1);
  assert.equal(average?.trend_directional_accuracy, 1);
  assert.equal(average?.bullish_directional_accuracy, 1);
  assert.equal(average?.bearish_directional_accuracy, 1);
  assert.equal(averageMetrics([]), null);
});
