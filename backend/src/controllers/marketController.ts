import { z } from "zod";
import type { Request, Response } from "express";
import { getKlines, getKlinesRange, getTickers, listSymbols, getTicker } from "../services/binance.js";
import { computeIndicators } from "../services/indicators.js";

const tfSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);

export async function symbols(_req: Request, res: Response) {
  const data = await listSymbols();
  res.json({ symbols: data });
}

export async function ticker(req: Request, res: Response) {
  const symbol = String(req.params.symbol).toUpperCase();
  const data = await getTicker(symbol);
  res.json(data);
}

export async function tickers(req: Request, res: Response) {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
  if (!symbols.length) {
    res.status(400).json({ error: "symbols query parameter is required (comma separated)" });
    return;
  }
  res.json({ items: await getTickers(symbols) });
}

export async function klines(req: Request, res: Response) {
  const symbol = String(req.params.symbol).toUpperCase();
  const timeframe = tfSchema.parse(req.query.timeframe ?? "1h");
  const limit = z.coerce.number().min(50).max(1500).parse(req.query.limit ?? 500);
  const startTime = req.query.startTime ? z.coerce.number().int().parse(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? z.coerce.number().int().parse(req.query.endTime) : undefined;

  const data =
    startTime != null && endTime != null
      ? await getKlinesRange(symbol, timeframe, startTime, endTime)
      : await getKlines(symbol, timeframe, limit);
  res.json({ symbol, timeframe, candles: data });
}

export async function indicators(req: Request, res: Response) {
  const symbol = String(req.params.symbol).toUpperCase();
  const timeframe = tfSchema.parse(req.query.timeframe ?? "1h");
  const limit = z.coerce.number().min(50).max(1000).parse(req.query.limit ?? 500);
  const candles = await getKlines(symbol, timeframe, limit);
  res.json({ symbol, timeframe, indicators: computeIndicators(candles) });
}
