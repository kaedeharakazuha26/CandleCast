import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, IndicatorSeries } from "../types/market";

type IndicatorFlags = {
  ema: boolean;
  sma: boolean;
  bb: boolean;
  vwap: boolean;
  volume: boolean;
};

type Props = {
  candles: Candle[];
  predicted: Candle[];
  actual: Candle[];
  indicators: IndicatorSeries | null;
  show: IndicatorFlags;
  uncertaintyStd: number[] | null;
  height?: number;
};

function toCandle(c: Candle) {
  return {
    time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function uniqueSorted(candles: Candle[]) {
  const byTime = new Map<number, Candle>();
  for (const c of candles) byTime.set(c.timestamp, c);
  return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function lineData(timestamps: number[], values: Array<number | null>) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const value = values[i];
    if (value == null || !Number.isFinite(value)) continue;
    out.push({ time: Math.floor(timestamps[i] / 1000) as UTCTimestamp, value });
  }
  return out;
}

export function CandleChart({
  candles,
  predicted,
  actual,
  indicators,
  show,
  uncertaintyStd,
  height = 520,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const predRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const actualRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const uncUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const uncLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lastFit = useRef<string>("");

  const trimmed = useMemo(() => {
    const sorted = uniqueSorted(candles);
    if (!predicted.length) return sorted;
    const firstPredicted = Math.min(...predicted.map((c) => c.timestamp));
    return sorted.filter((c) => c.timestamp < firstPredicted);
  }, [candles, predicted]);

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#171F2B" },
        textColor: "#94A3B8",
        fontFamily: "IBM Plex Sans, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(148,163,184,0.4)", labelBackgroundColor: "#243044" },
        horzLine: { color: "rgba(148,163,184,0.4)", labelBackgroundColor: "#243044" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#00C087",
      downColor: "#F6465D",
      borderUpColor: "#00C087",
      borderDownColor: "#F6465D",
      wickUpColor: "#00C087",
      wickDownColor: "#F6465D",
      priceLineVisible: true,
    });
    const pred = chart.addCandlestickSeries({
      upColor: "rgba(59,130,246,0.28)",
      downColor: "rgba(99,102,241,0.28)",
      borderUpColor: "#60A5FA",
      borderDownColor: "#818CF8",
      wickUpColor: "#60A5FA",
      wickDownColor: "#818CF8",
      title: "Kronos",
      priceLineVisible: false,
    });
    const realized = chart.addCandlestickSeries({
      upColor: "rgba(250,204,21,0.12)",
      downColor: "rgba(250,204,21,0.12)",
      borderUpColor: "#FBBF24",
      borderDownColor: "#F59E0B",
      wickUpColor: "#FBBF24",
      wickDownColor: "#F59E0B",
      title: "Realized",
      priceLineVisible: false,
    });
    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const line = (color: string, width: 1 | 2 = 1, style = LineStyle.Solid, title?: string) =>
      chart.addLineSeries({
        color,
        lineWidth: width,
        lineStyle: style,
        title,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

    ema9Ref.current = line("#38BDF8", 1, LineStyle.Solid, "EMA9");
    ema20Ref.current = line("#A78BFA", 1, LineStyle.Solid, "EMA20");
    ema50Ref.current = line("#F59E0B", 1, LineStyle.Solid, "EMA50");
    ema200Ref.current = line("#F43F5E", 2, LineStyle.Solid, "EMA200");
    sma20Ref.current = line("#E2E8F0", 1, LineStyle.Dotted, "SMA20");
    bbUpperRef.current = line("rgba(148,163,184,0.7)", 1, LineStyle.Dashed, "BB upper");
    bbMidRef.current = line("rgba(148,163,184,0.5)", 1, LineStyle.Dotted, "BB mid");
    bbLowerRef.current = line("rgba(148,163,184,0.7)", 1, LineStyle.Dashed, "BB lower");
    vwapRef.current = line("#22D3EE", 1, LineStyle.LargeDashed, "VWAP");
    uncUpperRef.current = line("rgba(96,165,250,0.65)", 1, LineStyle.Dotted, "+1σ");
    uncLowerRef.current = line("rgba(96,165,250,0.65)", 1, LineStyle.Dotted, "-1σ");

    chartRef.current = chart;
    mainRef.current = series;
    predRef.current = pred;
    actualRef.current = realized;
    volRef.current = volume;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    mainRef.current?.setData(trimmed.map(toCandle));
    predRef.current?.setData(uniqueSorted(predicted).map(toCandle));
    actualRef.current?.setData(uniqueSorted(actual).map(toCandle));
    volRef.current?.setData(
      show.volume
        ? trimmed.map((c) => ({
            time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "rgba(0,192,135,0.3)" : "rgba(246,70,93,0.3)",
          }))
        : [],
    );

    const t = indicators?.timestamps ?? [];
    const set = (ref: MutableRefObject<ISeriesApi<"Line"> | null>, values?: Array<number | null>) => {
      ref.current?.setData(show.ema && values ? lineData(t, values) : []);
    };
    set(ema9Ref, indicators?.ema9);
    set(ema20Ref, indicators?.ema20);
    set(ema50Ref, indicators?.ema50);
    set(ema200Ref, indicators?.ema200);
    sma20Ref.current?.setData(show.sma ? lineData(t, indicators?.sma20 ?? []) : []);
    bbUpperRef.current?.setData(show.bb ? lineData(t, indicators?.bbUpper ?? []) : []);
    bbMidRef.current?.setData(show.bb ? lineData(t, indicators?.bbMid ?? []) : []);
    bbLowerRef.current?.setData(show.bb ? lineData(t, indicators?.bbLower ?? []) : []);
    vwapRef.current?.setData(show.vwap ? lineData(t, indicators?.vwap ?? []) : []);

    if (uncertaintyStd && uncertaintyStd.length === predicted.length && predicted.length) {
      const upper = predicted.map((c, i) => ({ time: Math.floor(c.timestamp / 1000) as UTCTimestamp, value: c.close + (uncertaintyStd[i] ?? 0) }));
      const lower = predicted.map((c, i) => ({ time: Math.floor(c.timestamp / 1000) as UTCTimestamp, value: c.close - (uncertaintyStd[i] ?? 0) }));
      uncUpperRef.current?.setData(upper);
      uncLowerRef.current?.setData(lower);
    } else {
      uncUpperRef.current?.setData([]);
      uncLowerRef.current?.setData([]);
    }

    const fitKey = `${trimmed[0]?.timestamp ?? 0}:${trimmed.length}:${predicted.length}:${predicted[predicted.length - 1]?.timestamp ?? 0}`;
    if (fitKey !== lastFit.current && trimmed.length) {
      lastFit.current = fitKey;
      chartRef.current?.timeScale().fitContent();
    }
  }, [trimmed, predicted, actual, indicators, show, uncertaintyStd]);

  return <div ref={host} style={{ height }} className="w-full" />;
}
