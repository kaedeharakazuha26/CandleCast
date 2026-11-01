import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3001),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  binanceRest: process.env.BINANCE_REST_URL ?? "https://api.binance.com",
  binanceWs: process.env.BINANCE_WS_URL ?? "wss://stream.binance.com:9443/ws",
  predictionTimeoutMs: Number(process.env.PREDICTION_TIMEOUT_MS ?? 600_000),
  backtestTimeoutMs: Number(process.env.BACKTEST_TIMEOUT_MS ?? 1_800_000),
};

export const TIMEFRAMES = {
  "1m": { binance: "1m", ms: 60_000 },
  "5m": { binance: "5m", ms: 5 * 60_000 },
  "15m": { binance: "15m", ms: 15 * 60_000 },
  "30m": { binance: "30m", ms: 30 * 60_000 },
  "1h": { binance: "1h", ms: 60 * 60_000 },
  "4h": { binance: "4h", ms: 4 * 60 * 60_000 },
  "1d": { binance: "1d", ms: 24 * 60 * 60_000 },
  "1w": { binance: "1w", ms: 7 * 24 * 60 * 60_000 },
} as const;

export type Timeframe = keyof typeof TIMEFRAMES;

export const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
