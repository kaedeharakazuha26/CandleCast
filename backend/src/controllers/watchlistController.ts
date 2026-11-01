import { z } from "zod";
import type { Request, Response } from "express";
import { prisma } from "../database/prisma.js";
import { DEFAULT_SYMBOLS } from "../config.js";
import { getTicker } from "../services/binance.js";

export async function listWatchlist(_req: Request, res: Response) {
  let items = await prisma.watchlistItem.findMany({ orderBy: { createdAt: "asc" } });
  if (!items.length) {
    await prisma.watchlistItem.createMany({
      data: DEFAULT_SYMBOLS.map((symbol) => ({ symbol })),
      skipDuplicates: true,
    });
    items = await prisma.watchlistItem.findMany({ orderBy: { createdAt: "asc" } });
  }
  const tickers = await Promise.all(
    items.map(async (item) => {
      const [ticker, latest] = await Promise.all([
        getTicker(item.symbol).catch(() => null),
        prisma.prediction.findFirst({
          where: { symbol: item.symbol },
          orderBy: { createdAt: "desc" },
          select: { id: true, direction: true, signal: true, timeframe: true, horizon: true, createdAt: true },
        }),
      ]);
      return { ...item, ticker, latestPrediction: latest };
    }),
  );
  res.json({ items: tickers });
}

export async function addWatchlist(req: Request, res: Response) {
  const { symbol } = z.object({ symbol: z.string().min(3).transform((s) => s.toUpperCase()) }).parse(req.body);
  const item = await prisma.watchlistItem.upsert({
    where: { symbol },
    update: {},
    create: { symbol },
  });
  res.status(201).json(item);
}

export async function removeWatchlist(req: Request, res: Response) {
  await prisma.watchlistItem.deleteMany({ where: { id: String(req.params.id) } });
  res.status(204).end();
}

export async function listAlerts(_req: Request, res: Response) {
  const items = await prisma.priceAlert.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ items });
}

const alertSchema = z
  .object({
    symbol: z.string().min(3).transform((s) => s.toUpperCase()),
    type: z.enum(["price_above", "price_below", "pct_move", "bullish_prediction", "bearish_prediction"]),
    value: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (["price_above", "price_below", "pct_move"].includes(data.type) && data.value == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: `${data.type} requires a value` });
    }
    if (data.type === "pct_move" && data.value != null && data.value <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "pct_move must be greater than zero" });
    }
    if (["price_above", "price_below"].includes(data.type) && data.value != null && data.value <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "price thresholds must be positive" });
    }
  });

export async function addAlert(req: Request, res: Response) {
  const body = alertSchema.parse(req.body);
  const item = await prisma.priceAlert.create({
    data: { symbol: body.symbol, type: body.type, value: body.value },
  });
  res.status(201).json(item);
}

export async function removeAlert(req: Request, res: Response) {
  await prisma.priceAlert.deleteMany({ where: { id: String(req.params.id) } });
  res.status(204).end();
}
