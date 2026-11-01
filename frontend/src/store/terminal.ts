import { create } from "zustand";
import type {
  Candle,
  IndicatorSeries,
  PredictionPayload,
  Ticker,
  Timeframe,
} from "../types/market";

type IndicatorFlags = {
  ema: boolean;
  sma: boolean;
  bb: boolean;
  vwap: boolean;
  volume: boolean;
};

type State = {
  symbol: string;
  timeframe: Timeframe;
  horizon: number;
  lookback: number;
  scenarios: boolean;
  uncertaintySamples: number;
  ticker: Ticker | null;
  candles: Candle[];
  predicted: Candle[];
  actual: Candle[];
  uncertaintyStd: number[] | null;
  indicatorSeries: IndicatorSeries | null;
  prediction: PredictionPayload | null;
  loadingMarket: boolean;
  loadingPrediction: boolean;
  error: string | null;
  live: boolean;
  indicators: IndicatorFlags;
  setSymbol: (symbol: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setHorizon: (horizon: number) => void;
  setLookback: (lookback: number) => void;
  setScenarios: (value: boolean) => void;
  setUncertaintySamples: (value: number) => void;
  setTicker: (ticker: Ticker | null) => void;
  setCandles: (candles: Candle[]) => void;
  upsertLiveCandle: (candle: Candle) => void;
  setPredicted: (candles: Candle[], std?: number[] | null) => void;
  setActual: (candles: Candle[]) => void;
  setIndicatorSeries: (series: IndicatorSeries | null) => void;
  setPrediction: (prediction: PredictionPayload | null) => void;
  setLoadingMarket: (value: boolean) => void;
  setLoadingPrediction: (value: boolean) => void;
  setError: (error: string | null) => void;
  setLive: (value: boolean) => void;
  toggleIndicator: (key: keyof IndicatorFlags) => void;
};

export const useTerminal = create<State>((set) => ({
  symbol: "BTCUSDT",
  timeframe: "1h",
  horizon: 5,
  lookback: 400,
  scenarios: false,
  uncertaintySamples: 0,
  ticker: null,
  candles: [],
  predicted: [],
  actual: [],
  uncertaintyStd: null,
  indicatorSeries: null,
  prediction: null,
  loadingMarket: false,
  loadingPrediction: false,
  error: null,
  live: false,
  indicators: { ema: true, sma: false, bb: false, vwap: false, volume: true },
  setSymbol: (symbol) =>
    set({
      symbol,
      candles: [],
      ticker: null,
      predicted: [],
      prediction: null,
      actual: [],
      uncertaintyStd: null,
      indicatorSeries: null,
    }),
  setTimeframe: (timeframe) =>
    set({
      timeframe,
      candles: [],
      predicted: [],
      prediction: null,
      actual: [],
      uncertaintyStd: null,
      indicatorSeries: null,
    }),
  setHorizon: (horizon) => set({ horizon }),
  setLookback: (lookback) => set({ lookback }),
  setScenarios: (scenarios) => set({ scenarios }),
  setUncertaintySamples: (uncertaintySamples) => set({ uncertaintySamples }),
  setTicker: (ticker) => set({ ticker }),
  setCandles: (candles) => set({ candles }),
  upsertLiveCandle: (candle) =>
    set((state) => {
      const next = [...state.candles];
      const last = next[next.length - 1];
      if (last && last.timestamp === candle.timestamp) next[next.length - 1] = candle;
      else if (!last || candle.timestamp > last.timestamp) next.push(candle);
      const ticker = state.ticker ? { ...state.ticker, price: candle.close } : state.ticker;
      return { candles: next, ticker };
    }),
  setPredicted: (predicted, std) => set({ predicted, uncertaintyStd: std ?? null }),
  setActual: (actual) => set({ actual }),
  setIndicatorSeries: (indicatorSeries) => set({ indicatorSeries }),
  setPrediction: (prediction) => set({ prediction }),
  setLoadingMarket: (loadingMarket) => set({ loadingMarket }),
  setLoadingPrediction: (loadingPrediction) => set({ loadingPrediction }),
  setError: (error) => set({ error }),
  setLive: (live) => set({ live }),
  toggleIndicator: (key) =>
    set((state) => ({ indicators: { ...state.indicators, [key]: !state.indicators[key] } })),
}));
