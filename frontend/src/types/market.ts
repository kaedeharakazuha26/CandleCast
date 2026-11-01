export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
};

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export type Ticker = {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  /** Unix ms when a streaming tick was received. Absent on REST snapshots. */
  updatedAt?: number;
};

export type IndicatorSeries = {
  timestamps: number[];
  rsi: Array<number | null>;
  macd: Array<number | null>;
  macdSignal: Array<number | null>;
  macdHist: Array<number | null>;
  ema9: Array<number | null>;
  ema20: Array<number | null>;
  ema50: Array<number | null>;
  ema200: Array<number | null>;
  sma20: Array<number | null>;
  bbUpper: Array<number | null>;
  bbMid: Array<number | null>;
  bbLower: Array<number | null>;
  atr: Array<number | null>;
  vwap: Array<number | null>;
  stochRsi: Array<number | null>;
  latest: Record<string, number | null>;
};

export type Uncertainty = {
  source: "independent-passes" | "path-dispersion";
  passes: number;
  closeStdFinal: number | null;
  closeBand: { lower: number; upper: number };
  note: string;
};

export type Analysis = {
  marketDirection: "Bullish" | "Bearish" | "Sideways";
  predictedPrice: {
    nextClose: number;
    lastHorizonClose: number;
    range: { min: number; max: number; low: number; high: number };
    percentMove: number;
  };
  candleAnalysis: Candle;
  sequence: Candle[];
  trend: {
    shortTerm: string;
    mediumTerm: string;
    momentum: string;
    volatility: string;
  };
  signal: {
    direction: string;
    supporting: string[];
    predictedPercent: number;
    risk: string;
    timestamp: number;
  };
  uncertainty: Uncertainty;
  explanation: string;
  disclaimer: string;
};

export type PredictionResult = {
  predicted: Candle[];
  inference_ms: number;
  lookback: number;
  model_version: string;
  notes: string[];
  transformations: unknown[];
  uncertainty_samples: number;
  sample_close_std: number[] | null;
  sample_high_std: number[] | null;
  sample_low_std: number[] | null;
  last_context_timestamp: number;
  device: string;
  pred_len: number;
  max_context: number;
  temperature: number;
  top_p: number;
  sample_count: number;
};

export type PredictionRun = {
  id: string;
  horizon: number;
  result: PredictionResult;
  analysis: Analysis;
};

export type PredictionPayload = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  contextLast: Candle;
  indicators: Record<string, number | null>;
  primary: PredictionRun;
  scenarios?: PredictionRun[];
  disclaimer: string;
};

export type PredictionMetrics = {
  n: number;
  mae: Record<string, number>;
  rmse: Record<string, number>;
  mape: Record<string, number | null>;
  directional_accuracy: number;
  trend_directional_accuracy: number | null;
  predicted_trend: string | null;
  actual_trend: string | null;
  open_price_error: number;
  high_price_error: number;
  low_price_error: number;
  close_price_error: number;
  volume_prediction_error: number;
};

export type HistoryItem = {
  id: string;
  symbol: string;
  timeframe: string;
  horizon: number;
  lookback: number;
  marketTimestamp: string;
  modelVersion: string;
  temperature: number;
  topP: number;
  sampleCount: number;
  uncertaintySamples: number;
  inferenceMs: number;
  createdAt: string;
  evaluatedAt: string | null;
  explanation: string | null;
  direction: string | null;
  signal: string | null;
  metrics: PredictionMetrics | null;
  hasActual: boolean;
  actualCount: number;
  predictedCount: number;
};

export type PredictionDetail = HistoryItem & {
  context: Candle[];
  predicted: Candle[];
  actual: Candle[];
  sampleCloseStd: number[] | null;
};

export type AccuracyGroup = {
  name: string;
  runs: number | null;
  candles: number | null;
  directional_accuracy: number | null;
  trend_directional_accuracy: number | null;
  bullish_directional_accuracy: number | null;
  bearish_directional_accuracy: number | null;
  bullish_windows: number | null;
  bearish_windows: number | null;
  mae: Record<string, number | null> | null;
  rmse: Record<string, number | null> | null;
};

export type AccuracyResponse = {
  overall: AccuracyGroup | null;
  bySymbol: AccuracyGroup[];
  byTimeframe: AccuracyGroup[];
  byHorizon: AccuracyGroup[];
  totals: { predictions: number; evaluated: number; pending: number };
  note: string;
};

export type BacktestPoint = {
  window: number;
  contextStart: number;
  contextEnd: number;
  predicted: Candle[] | null;
  actual: Candle[];
  contextLastClose: number;
  ok: boolean;
  inferenceMs: number | null;
  metrics: PredictionMetrics | null;
  error: string | null;
};

export type BacktestRun = {
  id: string;
  symbol: string;
  timeframe: string;
  horizon: number;
  lookback: number;
  windowCount: number;
  status: string;
  metrics: PredictionMetrics | null;
  points?: BacktestPoint[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  windows?: number;
  skipped?: number;
};

export type Alert = {
  id: string;
  symbol: string;
  type: string;
  value: number | null;
  triggered: boolean;
  triggeredAt: string | null;
  message: string | null;
  createdAt: string;
};

export type WatchlistItem = {
  id: string;
  symbol: string;
  createdAt: string;
  ticker: Ticker | null;
  latestPrediction: {
    id: string;
    direction: string | null;
    signal: string | null;
    timeframe: string;
    horizon: number;
    createdAt: string;
  } | null;
};
