import axios from "axios";
import type {
  AccuracyResponse,
  Alert,
  BacktestRun,
  Candle,
  HistoryItem,
  IndicatorSeries,
  PredictionDetail,
  PredictionPayload,
  Ticker,
  Timeframe,
  WatchlistItem,
} from "../types/market";

export const api = axios.create({ baseURL: "/api", timeout: 600_000 });

export async function fetchSymbols() {
  const { data } = await api.get<{ symbols: string[] }>("/market/symbols");
  return data.symbols;
}

export async function fetchTicker(symbol: string) {
  const { data } = await api.get<Ticker>(`/market/ticker/${symbol}`);
  return data;
}

export async function fetchTickers(symbols: string[]) {
  if (!symbols.length) return [] as Ticker[];
  const { data } = await api.get<{ items: Ticker[] }>("/market/tickers", {
    params: { symbols: symbols.join(",") },
  });
  return data.items;
}

export async function fetchKlines(
  symbol: string,
  timeframe: Timeframe,
  limit = 500,
  range?: { startTime: number; endTime: number },
) {
  const { data } = await api.get<{ candles: Candle[] }>(`/market/klines/${symbol}`, {
    params: { timeframe, limit, ...range },
  });
  return data.candles;
}

export async function fetchIndicators(symbol: string, timeframe: Timeframe, limit = 500) {
  const { data } = await api.get<{ indicators: IndicatorSeries }>(`/indicators/${symbol}`, {
    params: { timeframe, limit },
  });
  return data.indicators;
}

export async function generatePrediction(body: {
  symbol: string;
  timeframe: Timeframe;
  horizon: number;
  lookback?: number;
  sample_count?: number;
  uncertainty_samples?: number;
  temperature?: number;
  top_p?: number;
  scenarios?: boolean;
}) {
  const { data } = await api.post<PredictionPayload>("/predictions/generate", body);
  return data;
}

export async function fetchHistory(params: {
  symbol?: string;
  timeframe?: string;
  horizon?: number;
  limit?: number;
}) {
  const { data } = await api.get<{ items: HistoryItem[] }>("/predictions/history", { params });
  return data.items;
}

export async function fetchPrediction(id: string) {
  const { data } = await api.get<PredictionDetail>(`/predictions/${id}`);
  return data;
}

export async function fetchAccuracy() {
  const { data } = await api.get<AccuracyResponse>("/predictions/accuracy");
  return data;
}

export async function evaluatePendingPredictions() {
  const { data } = await api.post<{ checked: number; evaluated: number; waiting: number }>(
    "/predictions/evaluate-pending",
  );
  return data;
}

export async function runBacktest(body: {
  symbol: string;
  timeframe: Timeframe;
  horizon: number;
  lookback: number;
  windows: number;
  step: number;
}) {
  const { data } = await api.post<BacktestRun>("/backtesting/run", body);
  return data;
}

export async function fetchBacktests() {
  const { data } = await api.get<{ items: BacktestRun[] }>("/backtesting/results");
  return data.items;
}

export async function fetchBacktest(id: string) {
  const { data } = await api.get<BacktestRun>(`/backtesting/${id}`);
  return data;
}

export async function fetchWatchlist() {
  const { data } = await api.get<{ items: WatchlistItem[] }>("/watchlist");
  return data.items;
}

export async function addWatchlist(symbol: string) {
  const { data } = await api.post("/watchlist", { symbol });
  return data;
}

export async function removeWatchlist(id: string) {
  await api.delete(`/watchlist/${id}`);
}

export async function fetchAlerts() {
  const { data } = await api.get<{ items: Alert[] }>("/alerts");
  return data.items;
}

export async function addAlert(body: { symbol: string; type: string; value?: number }) {
  const { data } = await api.post("/alerts", body);
  return data;
}

export async function removeAlert(id: string) {
  await api.delete(`/alerts/${id}`);
}

export type ModelInfo = {
  loaded: boolean;
  device?: string;
  model_id?: string;
  tokenizer_id?: string;
  model_version?: string;
  max_context?: number;
  max_pred_len?: number;
  default_lookback?: number;
  max_uncertainty_samples?: number;
  params?: string;
  notes?: string[];
  error?: string;
  detail?: unknown;
};

export async function fetchModelInfo() {
  const { data } = await api.get<ModelInfo>("/model/info");
  return data;
}

export function exportUrl(id: string) {
  return `/api/predictions/${id}/export`;
}

export function exportHistoryUrl(params: { symbol?: string; timeframe?: string; horizon?: number }) {
  const query = new URLSearchParams();
  if (params.symbol) query.set("symbol", params.symbol);
  if (params.timeframe) query.set("timeframe", params.timeframe);
  if (params.horizon) query.set("horizon", String(params.horizon));
  return `/api/predictions/export?${query.toString()}`;
}

export function backtestExportUrl(id: string) {
  return `/api/backtesting/${id}/export`;
}
