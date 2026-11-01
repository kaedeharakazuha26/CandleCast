import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Request, Response } from "express";
import { TIMEFRAMES, type Timeframe } from "../config.js";
import { prisma } from "../database/prisma.js";
import { getKlines } from "../services/binance.js";
import { runEvaluate } from "../services/ai.js";
import type { Candle } from "../utils/types.js";

const schema = z.object({
  symbol: z.string().min(3).transform((s) => s.toUpperCase()),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]),
  horizon: z.number().int().min(1).max(50),
  lookback: z.number().int().min(64).max(512).default(256),
  windows: z.number().int().min(1).max(12).default(4),
  step: z.number().int().min(1).max(500).default(32),
  temperature: z.number().min(0.1).max(2).default(1),
  top_p: z.number().min(0.1).max(1).default(0.9),
  sample_count: z.number().int().min(1).max(4).default(1),
});

type EvaluationDetail = {
  ok: boolean;
  metrics?: Record<string, unknown>;
  predicted?: Candle[];
  actual?: Candle[];
  context_last_close?: number;
  inference_ms?: number;
  error?: string;
};

export async function runBacktest(req: Request, res: Response) {
  const body = schema.parse(req.body);
  const tf = TIMEFRAMES[body.timeframe];
  const raw = await getKlines(body.symbol, body.timeframe, 1000);
  const candles = raw.length > 1 ? raw.slice(0, -1) : raw;

  const needed = body.lookback + body.horizon + body.step * (body.windows - 1) + 1;
  if (candles.length < needed) {
    res.status(400).json({
      error: `Need at least ${needed} closed candles for this walk-forward setup; Binance returned ${candles.length}. Reduce windows, step, lookback, or horizon.`,
    });
    return;
  }

  const windows = [];
  const origin = candles.length - body.horizon;
  for (let i = 0; i < body.windows; i += 1) {
    const actualEnd = origin - i * body.step;
    const actualStart = actualEnd - body.horizon;
    const contextEnd = actualStart;
    const contextStart = contextEnd - body.lookback;
    if (contextStart < 0) break;
    const context = candles.slice(contextStart, contextEnd);
    const actual = candles.slice(actualStart, actualEnd);
    if (context.length !== body.lookback || actual.length !== body.horizon) continue;
    windows.push({ context, actual });
  }

  if (!windows.length) {
    res.status(400).json({ error: "Could not construct walk-forward windows without look-ahead." });
    return;
  }

  const record = await prisma.backtestRun.create({
    data: {
      symbol: body.symbol,
      timeframe: body.timeframe,
      horizon: body.horizon,
      lookback: body.lookback,
      windowCount: windows.length,
      status: "running",
    },
  });

  try {
    const evaluation = await runEvaluate({
      windows,
      timeframe_ms: tf.ms,
      temperature: body.temperature,
      top_p: body.top_p,
      sample_count: body.sample_count,
    });

    const details: EvaluationDetail[] = evaluation.details ?? [];
    const points = windows.map((window, idx) => {
      const detail = details[idx];
      return {
        window: idx + 1,
        contextStart: window.context[0].timestamp,
        contextEnd: window.context[window.context.length - 1].timestamp,
        predicted: detail?.predicted ?? null,
        actual: detail?.actual ?? window.actual,
        contextLastClose: window.context[window.context.length - 1].close,
        ok: detail?.ok ?? false,
        inferenceMs: detail?.inference_ms ?? null,
        metrics: detail?.metrics ?? null,
        error: detail?.error ?? null,
      };
    });

    const updated = await prisma.backtestRun.update({
      where: { id: record.id },
      data: {
        status: evaluation.windows_evaluated ? "completed" : "failed",
        metrics: evaluation.metrics as unknown as Prisma.InputJsonValue,
        points: points as unknown as Prisma.InputJsonValue,
        error: evaluation.skipped
          ? `${evaluation.skipped} of ${windows.length} windows failed. See points[].error.`
          : null,
        finishedAt: new Date(),
      },
    });
    res.json({ ...updated, windows: evaluation.windows_evaluated, skipped: evaluation.skipped });
  } catch (error) {
    await prisma.backtestRun.update({
      where: { id: record.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function listBacktests(_req: Request, res: Response) {
  const items = await prisma.backtestRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      symbol: true,
      timeframe: true,
      horizon: true,
      lookback: true,
      windowCount: true,
      status: true,
      metrics: true,
      error: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  res.json({ items });
}

export async function getBacktest(req: Request, res: Response) {
  const item = await prisma.backtestRun.findUnique({ where: { id: String(req.params.id) } });
  if (!item) {
    res.status(404).json({ error: "Backtest not found" });
    return;
  }
  res.json(item);
}

export async function exportBacktest(req: Request, res: Response) {
  const item = await prisma.backtestRun.findUnique({ where: { id: String(req.params.id) } });
  if (!item) {
    res.status(404).json({ error: "Backtest not found" });
    return;
  }
  const points = (item.points as Array<Record<string, unknown>> | null) ?? [];
  const rows = [
    "# CandleCast walk-forward backtest",
    `# id,${item.id}`,
    `# symbol,${item.symbol}`,
    `# timeframe,${item.timeframe}`,
    `# horizon,${item.horizon}`,
    `# lookback,${item.lookback}`,
    `# status,${item.status}`,
    `# metrics,${JSON.stringify(item.metrics ?? {})}`,
    "window,kind,timestamp,open,high,low,close,volume,close_abs_error,direction_hit",
  ];
  for (const [idx, point] of points.entries()) {
    const windowNo = Number(point.window ?? idx + 1);
    const actual = (point.actual as Candle[] | null) ?? [];
    const predicted = (point.predicted as Candle[] | null) ?? [];
    const metrics = point.metrics as { mae?: { close?: number }; directional_accuracy?: number } | null;
    for (const [i, candle] of predicted.entries()) {
      const real = actual[i];
      const absError = real ? Math.abs(candle.close - real.close) : "";
      const hit = real ? Number(Math.sign(candle.close - candle.open) === Math.sign(real.close - real.open)) : "";
      rows.push(
        `${windowNo},forecast,${candle.timestamp},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume},${absError},${hit}`,
      );
    }
    for (const candle of actual) {
      rows.push(
        `${windowNo},actual,${candle.timestamp},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume},,`,
      );
    }
    if (metrics) {
      rows.push(
        `${windowNo},window_metrics,${point.contextEnd},,,,,,${metrics.mae?.close ?? ""},${metrics.directional_accuracy ?? ""}`,
      );
    }
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=candlecast-backtest-${item.symbol}-${item.timeframe}-h${item.horizon}-${item.id}.csv`,
  );
  res.send(rows.join("\n"));
}

export function toCsv(candles: Candle[]): string {
  return [
    "timestamp,open,high,low,close,volume",
    ...candles.map((c) => `${c.timestamp},${c.open},${c.high},${c.low},${c.close},${c.volume}`),
  ].join("\n");
}
