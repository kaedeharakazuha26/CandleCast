import { Prisma, type Prediction } from "@prisma/client";
import { z } from "zod";
import type { Request, Response } from "express";
import { TIMEFRAMES, type Timeframe } from "../config.js";
import { prisma } from "../database/prisma.js";
import { getKlines, getKlinesRange } from "../services/binance.js";
import { computeIndicators } from "../services/indicators.js";
import { summarizePrediction } from "../services/analysis.js";
import { getModelInfo, runPredict } from "../services/ai.js";
import { averageMetrics, computeMetrics, type PredictionMetrics } from "../services/metrics.js";
import { assertForecastCandles } from "../services/validation.js";
import { triggerPredictionAlerts } from "../services/alerts.js";
import type { Candle } from "../utils/types.js";

const timeframeSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);

const generateSchema = z.object({
  symbol: z.string().min(3).transform((s) => s.toUpperCase()),
  timeframe: timeframeSchema,
  horizon: z.number().int().refine((n) => [1, 3, 5, 10, 20, 50].includes(n), {
    message: "horizon must be 1, 3, 5, 10, 20, or 50",
  }),
  lookback: z.number().int().min(32).max(512).optional(),
  temperature: z.number().min(0.1).max(2).optional(),
  top_p: z.number().min(0.1).max(1).optional(),
  sample_count: z.number().int().min(1).max(8).optional(),
  uncertainty_samples: z.number().int().min(0).max(4).optional(),
  scenarios: z.boolean().optional(),
});

const historySchema = z.object({
  symbol: z.string().optional(),
  timeframe: timeframeSchema.optional(),
  horizon: z.coerce.number().int().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function asCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Candle =>
      typeof row === "object" &&
      row !== null &&
      Number.isFinite(Number((row as Candle).timestamp)) &&
      Number.isFinite(Number((row as Candle).open)),
  );
}

function storedMetrics(value: unknown): PredictionMetrics | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.n !== "number" || typeof candidate.mae !== "object") return null;
  return candidate as PredictionMetrics;
}

export async function generate(req: Request, res: Response) {
  const body = generateSchema.parse(req.body);
  const tf = TIMEFRAMES[body.timeframe];
  const candles = await getKlines(body.symbol, body.timeframe, 1000);
  // Binance returns the currently forming bar last. It is never used as model
  // context because its OHLCV values are not final.
  const closed = candles.length > 33 ? candles.slice(0, -1) : candles;
  if (closed.length < 32) {
    res.status(400).json({ error: "At least 32 closed candles are required for Kronos inference" });
    return;
  }
  const indicators = computeIndicators(closed);

  const horizons = body.scenarios
    ? Array.from(new Set([body.horizon, 5, 20, 50])).sort((a, b) => a - b)
    : [body.horizon];
  const runs = [];
  for (const horizon of horizons) {
    const result = await runPredict({
      candles: closed,
      pred_len: horizon,
      timeframe_ms: tf.ms,
      lookback: body.lookback,
      temperature: body.temperature,
      top_p: body.top_p,
      sample_count: body.sample_count,
      uncertainty_samples: body.uncertainty_samples,
    });
    assertForecastCandles(result.predicted, tf.ms, result.last_context_timestamp);
    const analysis = summarizePrediction(closed, result.predicted, indicators, {
      sampleCloseStd: result.sample_close_std,
      uncertaintySamples: result.uncertainty_samples,
    });
    const saved = await prisma.prediction.create({
      data: {
        symbol: body.symbol,
        timeframe: body.timeframe,
        horizon,
        lookback: result.lookback,
        marketTimestamp: BigInt(result.last_context_timestamp),
        predictedCandles: result.predicted as unknown as Prisma.InputJsonValue,
        contextCandles: closed.slice(-300) as unknown as Prisma.InputJsonValue,
        transformations: result.transformations as unknown as Prisma.InputJsonValue,
        notes: result.notes as unknown as Prisma.InputJsonValue,
        modelVersion: result.model_version,
        temperature: result.temperature,
        topP: result.top_p,
        sampleCount: result.sample_count,
        uncertaintySamples: result.uncertainty_samples,
        sampleCloseStd: (result.sample_close_std ?? undefined) as unknown as Prisma.InputJsonValue,
        inferenceMs: result.inference_ms,
        explanation: analysis.explanation,
        direction: analysis.marketDirection,
        signal: analysis.signal.direction,
      },
    });
    runs.push({ id: saved.id, horizon, result, analysis });
  }

  const primary = runs.find((r) => r.horizon === body.horizon) ?? runs[0];
  await triggerPredictionAlerts(body.symbol, primary.analysis.marketDirection, primary.analysis.explanation);
  res.json({
    id: primary.id,
    symbol: body.symbol,
    timeframe: body.timeframe,
    contextLast: closed[closed.length - 1],
    indicators: indicators.latest,
    primary,
    scenarios: body.scenarios ? runs : undefined,
    disclaimer: primary.analysis.disclaimer,
  });
}

export async function history(req: Request, res: Response) {
  const query = historySchema.parse(req.query);
  const symbol = query.symbol ? query.symbol.toUpperCase() : undefined;
  const items = await prisma.prediction.findMany({
    where: {
      ...(symbol ? { symbol } : {}),
      ...(query.timeframe ? { timeframe: query.timeframe } : {}),
      ...(query.horizon ? { horizon: query.horizon } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
  });
  res.json({ items: items.map(serializePrediction) });
}

export async function getOne(req: Request, res: Response) {
  const item = await prisma.prediction.findUnique({ where: { id: String(req.params.id) } });
  if (!item) {
    res.status(404).json({ error: "Prediction not found" });
    return;
  }
  const refreshed = await refreshActuals(item);
  res.json({
    ...serializePrediction(refreshed),
    context: asCandles(refreshed.contextCandles),
    predicted: asCandles(refreshed.predictedCandles),
    actual: asCandles(refreshed.actualCandles),
    metrics: storedMetrics(refreshed.metrics),
    sampleCloseStd: refreshed.sampleCloseStd,
  });
}

export async function evaluatePending(_req: Request, res: Response) {
  const now = Date.now();
  const items = await prisma.prediction.findMany({
    where: { metrics: { equals: Prisma.DbNull } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  let evaluated = 0;
  let waiting = 0;
  for (const item of items) {
    const tf = TIMEFRAMES[item.timeframe as Timeframe];
    const predicted = asCandles(item.predictedCandles);
    const lastPredicted = predicted.length ? predicted[predicted.length - 1].timestamp + tf.ms : 0;
    if (lastPredicted > now) {
      waiting += 1;
      continue;
    }
    const refreshed = await refreshActuals(item);
    if (storedMetrics(refreshed.metrics)) evaluated += 1;
    else waiting += 1;
  }
  res.json({ checked: items.length, evaluated, waiting });
}

export async function accuracy(_req: Request, res: Response) {
  const items = await prisma.prediction.findMany({ orderBy: { createdAt: "desc" }, take: 1000 });
  const evaluated = items
    .map((item) => ({
      item,
      metrics: storedMetrics(item.metrics),
    }))
    .filter((row): row is { item: Prediction; metrics: PredictionMetrics } => row.metrics != null);

  const group = (key: (item: Prediction) => string) => {
    const buckets = new Map<string, PredictionMetrics[]>();
    for (const row of evaluated) {
      const k = key(row.item);
      const list = buckets.get(k) ?? [];
      list.push(row.metrics);
      buckets.set(k, list);
    }
    return [...buckets.entries()]
      .map(([name, metrics]) => ({ name, ...averageMetrics(metrics) }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };

  res.json({
    overall: averageMetrics(evaluated.map((row) => row.metrics)),
    bySymbol: group((item) => item.symbol),
    byTimeframe: group((item) => item.timeframe),
    byHorizon: group((item) => `h${item.horizon}`),
    totals: {
      predictions: items.length,
      evaluated: evaluated.length,
      pending: items.length - evaluated.length,
    },
    note:
      evaluated.length === 0
        ? "No prediction has both a stored forecast and completed future candles yet. Accuracy is not estimated or fabricated."
        : "Metrics are averages over stored out-of-sample prediction windows. Directional accuracy compares the forecast horizon close with the actual horizon close and is not a profitability claim.",
  });
}

export async function exportHistory(req: Request, res: Response) {
  const query = historySchema.parse(req.query);
  const items = await prisma.prediction.findMany({
    where: {
      ...(query.symbol ? { symbol: query.symbol.toUpperCase() } : {}),
      ...(query.timeframe ? { timeframe: query.timeframe } : {}),
      ...(query.horizon ? { horizon: query.horizon } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const rows = [
    "id,symbol,timeframe,horizon,created_at,market_timestamp,model_version,direction,signal,temperature,top_p,sample_count,uncertainty_samples,inference_ms,evaluated_at,close_mae,close_rmse,close_mape,directional_accuracy,trend_directional_accuracy",
    ...items.map((item) => {
      const m = storedMetrics(item.metrics);
      return [
        item.id,
        item.symbol,
        item.timeframe,
        item.horizon,
        item.createdAt.toISOString(),
        item.marketTimestamp.toString(),
        item.modelVersion,
        item.direction ?? "",
        item.signal ?? "",
        item.temperature,
        item.topP,
        item.sampleCount,
        item.uncertaintySamples,
        item.inferenceMs,
        item.evaluatedAt?.toISOString() ?? "",
        m?.mae.close ?? "",
        m?.rmse.close ?? "",
        m?.mape.close ?? "",
        m?.directional_accuracy ?? "",
        m?.trend_directional_accuracy ?? "",
      ].join(",");
    }),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=candlecast-prediction-history.csv");
  res.send(rows.join("\n"));
}

export async function modelStatus(_req: Request, res: Response) {
  try {
    const info = await getModelInfo();
    res.json(info);
  } catch (error) {
    res.status(503).json({
      loaded: false,
      error: "AI service unreachable",
      detail: error instanceof Error ? error.message : error,
    });
  }
}

export async function exportCsv(req: Request, res: Response) {
  const item = await prisma.prediction.findUnique({ where: { id: String(req.params.id) } });
  if (!item) {
    res.status(404).json({ error: "Prediction not found" });
    return;
  }
  const refreshed = await refreshActuals(item);
  const predicted = asCandles(refreshed.predictedCandles);
  const actual = asCandles(refreshed.actualCandles);
  const rows = [
    "timestamp,open,high,low,close,volume,source",
    ...predicted.map(
      (c) => `${c.timestamp},${c.open},${c.high},${c.low},${c.close},${c.volume},candlecast_forecast`,
    ),
    ...actual.map((c) => `${c.timestamp},${c.open},${c.high},${c.low},${c.close},${c.volume},actual`),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=candlecast-${item.symbol}-${item.timeframe}-h${item.horizon}-${item.id}.csv`,
  );
  res.send(rows.join("\n"));
}

async function refreshActuals(item: Prediction): Promise<Prediction> {
  const predicted = asCandles(item.predictedCandles);
  if (!predicted.length) return item;
  const tf = TIMEFRAMES[item.timeframe as Timeframe];
  const existing = asCandles(item.actualCandles);
  const now = Date.now();

  if (existing.length >= item.horizon) {
    if (!storedMetrics(item.metrics)) return evaluateAndStore(item, existing, predicted);
    return item;
  }

  const firstPredicted = predicted[0].timestamp;
  if (firstPredicted + tf.ms > now) return item;

  const end = firstPredicted + tf.ms * (item.horizon + 2);
  const market = await getKlinesRange(item.symbol, item.timeframe as Timeframe, firstPredicted, end);
  const completed = market
    .filter((c) => c.timestamp >= firstPredicted && c.timestamp + tf.ms <= now)
    .slice(0, item.horizon);

  if (completed.length <= existing.length) {
    if (completed.length >= item.horizon) return evaluateAndStore(item, completed, predicted);
    return item;
  }

  const updated = await prisma.prediction.update({
    where: { id: item.id },
    data: { actualCandles: completed as unknown as Prisma.InputJsonValue },
  });
  if (completed.length >= item.horizon) return evaluateAndStore(updated, completed, predicted);
  return updated;
}

async function evaluateAndStore(
  item: Prediction,
  actual: Candle[],
  predicted: Candle[],
): Promise<Prediction> {
  let contextClose: number | undefined;
  const context = asCandles(item.contextCandles);
  if (context.length) {
    contextClose = context[context.length - 1].close;
  } else {
    const tf = TIMEFRAMES[item.timeframe as Timeframe];
    try {
      const before = await getKlinesRange(
        item.symbol,
        item.timeframe as Timeframe,
        Number(item.marketTimestamp),
        Number(item.marketTimestamp) + tf.ms,
      );
      contextClose = before[0]?.close;
    } catch {
      // Metrics still work without trend accuracy when context is unavailable.
    }
  }

  const metrics = computeMetrics(predicted, actual, contextClose);
  return prisma.prediction.update({
    where: { id: item.id },
    data: {
      metrics: metrics as unknown as Prisma.InputJsonValue,
      evaluatedAt: new Date(),
    },
  });
}

function serializePrediction(item: Prediction) {
  const predicted = asCandles(item.predictedCandles);
  const actual = asCandles(item.actualCandles);
  return {
    id: item.id,
    symbol: item.symbol,
    timeframe: item.timeframe,
    horizon: item.horizon,
    lookback: item.lookback,
    marketTimestamp: item.marketTimestamp.toString(),
    modelVersion: item.modelVersion,
    temperature: item.temperature,
    topP: item.topP,
    sampleCount: item.sampleCount,
    uncertaintySamples: item.uncertaintySamples,
    inferenceMs: item.inferenceMs,
    createdAt: item.createdAt,
    evaluatedAt: item.evaluatedAt,
    explanation: item.explanation,
    direction: item.direction,
    signal: item.signal,
    metrics: storedMetrics(item.metrics),
    hasActual: actual.length > 0,
    actualCount: actual.length,
    predictedCount: predicted.length,
  };
}
