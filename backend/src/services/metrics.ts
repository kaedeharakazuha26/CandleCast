import type { Candle } from "../utils/types.js";

export const METRIC_FIELDS = ["open", "high", "low", "close", "volume"] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

export type PredictionMetrics = {
  n: number;
  mae: Record<MetricField, number>;
  rmse: Record<MetricField, number>;
  mape: Record<MetricField, number | null>;
  directional_accuracy: number;
  trend_directional_accuracy: number | null;
  predicted_trend: "Bullish" | "Bearish" | "Flat" | null;
  actual_trend: "Bullish" | "Bearish" | "Flat" | null;
  open_price_error: number;
  high_price_error: number;
  low_price_error: number;
  close_price_error: number;
  volume_prediction_error: number;
};

function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * Mirrors the Python evaluation module so stored predictions and walk-forward
 * backtests report metrics with the same definitions.
 */
export function computeMetrics(
  predicted: Candle[],
  actual: Candle[],
  contextLastClose?: number,
): PredictionMetrics {
  const n = Math.min(predicted.length, actual.length);
  if (n === 0) throw new Error("No overlapping predicted and actual candles");

  const mae = {} as Record<MetricField, number>;
  const rmse = {} as Record<MetricField, number>;
  const mape = {} as Record<MetricField, number | null>;

  for (const field of METRIC_FIELDS) {
    let absSum = 0;
    let squaredSum = 0;
    let percentSum = 0;
    let percentCount = 0;
    for (let i = 0; i < n; i += 1) {
      const p = predicted[i][field];
      const a = actual[i][field];
      const err = p - a;
      absSum += Math.abs(err);
      squaredSum += err * err;
      if (Math.abs(a) > 1e-12) {
        percentSum += Math.abs(err / a) * 100;
        percentCount += 1;
      }
    }
    mae[field] = absSum / n;
    rmse[field] = Math.sqrt(squaredSum / n);
    mape[field] = percentCount ? percentSum / percentCount : null;
  }

  let directionHits = 0;
  for (let i = 0; i < n; i += 1) {
    if (sign(predicted[i].close - predicted[i].open) === sign(actual[i].close - actual[i].open)) {
      directionHits += 1;
    }
  }

  let predictedTrend: PredictionMetrics["predicted_trend"] = null;
  let actualTrend: PredictionMetrics["actual_trend"] = null;
  let trendAccuracy: number | null = null;
  if (contextLastClose != null && contextLastClose !== 0) {
    predictedTrend = trendLabel(sign(predicted[n - 1].close - contextLastClose));
    actualTrend = trendLabel(sign(actual[n - 1].close - contextLastClose));
    if (actualTrend !== "Flat") trendAccuracy = predictedTrend === actualTrend ? 1 : 0;
  }

  return {
    n,
    mae,
    rmse,
    mape,
    directional_accuracy: directionHits / n,
    trend_directional_accuracy: trendAccuracy,
    predicted_trend: predictedTrend,
    actual_trend: actualTrend,
    open_price_error: mae.open,
    high_price_error: mae.high,
    low_price_error: mae.low,
    close_price_error: mae.close,
    volume_prediction_error: mae.volume,
  };
}

function trendLabel(value: number): "Bullish" | "Bearish" | "Flat" {
  if (value > 0) return "Bullish";
  if (value < 0) return "Bearish";
  return "Flat";
}

export function averageMetrics(items: PredictionMetrics[]): Record<string, unknown> | null {
  if (!items.length) return null;
  const avg = (pick: (m: PredictionMetrics) => number | null | undefined) => {
    const values = items.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const avgField = (field: MetricField) => avg((m) => m.mae[field]);
  const avgRmse = (field: MetricField) => avg((m) => m.rmse[field]);
  const trendItems = items.filter((m) => m.trend_directional_accuracy != null);

  return {
    runs: items.length,
    candles: items.reduce((sum, m) => sum + m.n, 0),
    mae: {
      open: avgField("open"),
      high: avgField("high"),
      low: avgField("low"),
      close: avgField("close"),
      volume: avgField("volume"),
    },
    rmse: {
      open: avgRmse("open"),
      high: avgRmse("high"),
      low: avgRmse("low"),
      close: avgRmse("close"),
      volume: avgRmse("volume"),
    },
    directional_accuracy: avg((m) => m.directional_accuracy),
    trend_directional_accuracy: avg((m) => m.trend_directional_accuracy),
    bullish_directional_accuracy: avg((m) =>
      m.actual_trend === "Bullish" ? m.trend_directional_accuracy : null,
    ),
    bearish_directional_accuracy: avg((m) =>
      m.actual_trend === "Bearish" ? m.trend_directional_accuracy : null,
    ),
    bullish_windows: items.filter((m) => m.actual_trend === "Bullish").length,
    bearish_windows: items.filter((m) => m.actual_trend === "Bearish").length,
    evaluated_windows: trendItems.length,
  };
}
