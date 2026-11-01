import { useEffect, useMemo, useState } from "react";
import { Activity, Download, FolderOpen, RefreshCw, Timer } from "lucide-react";
import { CandleChart } from "../charts/CandleChart";
import { Badge, Panel, Stat } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { MetricsTable } from "../components/MetricsTable";
import {
  backtestExportUrl,
  fetchBacktest,
  fetchBacktests,
  fetchKlines,
  fetchSymbols,
  runBacktest,
} from "../services/api";
import { useTerminal } from "../store/terminal";
import type { BacktestRun, Candle, Timeframe } from "../types/market";
import { cn } from "../utils/cn";
import { formatPercent, formatPrice, formatTime, timeAgo } from "../utils/format";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const COMMON = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
const HORIZONS = [1, 3, 5, 10, 20, 50];

function errorText(err: unknown): string {
  const data = (err as { response?: { data?: { error?: string; detail?: unknown } } }).response?.data;
  if (typeof data?.error === "string") {
    return typeof data.detail === "string" ? `${data.error}: ${data.detail}` : data.error;
  }
  return err instanceof Error ? err.message : "Backtest request failed.";
}

export function Backtesting() {
  const store = useTerminal();
  const [symbol, setSymbol] = useState(store.symbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(store.timeframe);
  const [horizon, setHorizon] = useState(store.horizon);
  const [lookback, setLookback] = useState(Math.min(store.lookback, 512));
  const [windows, setWindows] = useState(4);
  const [step, setStep] = useState(24);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [current, setCurrent] = useState<BacktestRun | null>(null);
  const [selectedWindow, setSelectedWindow] = useState(0);
  const [context, setContext] = useState<Candle[]>([]);

  const [busy, setBusy] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchSymbols()
      .then((list) => setSymbols(list))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBacktests()
      .then(async (items) => {
        if (cancelled) return;
        setRuns(items);
        if (items[0]) {
          const run = await fetchBacktest(items[0].id).catch(() => null);
          if (!cancelled && run) {
            setCurrent(run);
            setSelectedWindow(0);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    const run = current;
    const point = run?.points?.[selectedWindow];
    if (!run || !point || !point.predicted) {
      setContext([]);
      return;
    }
    let cancelled = false;
    setLoadingContext(true);
    fetchKlines(run.symbol, run.timeframe as Timeframe, 600, {
      startTime: point.contextStart,
      endTime: point.contextEnd,
    })
      .then((candles) => {
        if (!cancelled) setContext(candles);
      })
      .catch(() => {
        if (!cancelled) setContext([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
    // The selected run and window identify the context range.
  }, [current?.id, selectedWindow]);

  async function openRun(id: string) {
    setLoadingRun(true);
    setError(null);
    try {
      const run = await fetchBacktest(id);
      setCurrent(run);
      setSelectedWindow(0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingRun(false);
    }
  }

  async function run() {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(clean)) {
      setError("Enter a Binance symbol such as BTCUSDT.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runBacktest({
        symbol: clean,
        timeframe,
        horizon,
        lookback,
        windows,
        step,
      });
      setCurrent(result);
      setSelectedWindow(0);
      setNotice(
        `${result.windows ?? result.windowCount} of ${result.windowCount} windows evaluated${
          result.skipped ? ` · ${result.skipped} failed` : ""
        }.`,
      );
      const items = await fetchBacktests();
      setRuns(items);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const point = current?.points?.[selectedWindow] ?? null;
  const metrics = current?.metrics ?? null;
  const avgInference = useMemo(() => {
    const values = (current?.points ?? [])
      .map((p) => p.inferenceMs)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }, [current]);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-accent" />
              Walk-forward backtest
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-mute">
              Each window is forecast by Kronos using only candles that existed at that origin, then compared with the
              candles that actually followed. No future bar enters the context and no metric is estimated.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-5">
            <Stat label="Saved runs" value={runs.length} hint="latest 30" />
            <Stat label="Requested" value={windows} hint="windows" />
            <Stat
              label="Compute"
              value={busy ? `${elapsed}s` : "CPU/GPU"}
              hint={busy ? "Kronos sampling…" : "per-window inference"}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-mute">
            <span className="mb-1 block">Symbol</span>
            <Input
              list="backtest-symbols"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-[150px] font-mono"
              aria-label="Backtest symbol"
            />
            <datalist id="backtest-symbols">
              {[...new Set([...COMMON, ...symbols])].slice(0, 600).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-mute">
            <span className="mb-1 block">Timeframe</span>
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf}>{tf}</option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-mute">
            <span className="mb-1 block">Horizon</span>
            <Select value={String(horizon)} onChange={(e) => setHorizon(Number(e.target.value))}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-mute">
            <span className="mb-1 block">Lookback</span>
            <Select value={String(lookback)} onChange={(e) => setLookback(Number(e.target.value))}>
              {[128, 256, 400, 512].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-mute">
            <span className="mb-1 block">Windows</span>
            <Select value={String(windows)} onChange={(e) => setWindows(Number(e.target.value))}>
              {[1, 2, 4, 6, 8, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-mute">
            <span className="mb-1 block">Step</span>
            <Select value={String(step)} onChange={(e) => setStep(Number(e.target.value))}>
              {[1, 5, 12, 24, 48, 96].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <Button onClick={() => void run()} disabled={busy || loadingRun}>
            {busy ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Running · {elapsed}s
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" /> Run walk-forward
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-mute">
          {windows} windows × {horizon} forecast candles each. CPU inference is the slow path; raise windows only when
          you need a broader sample. One run may take several minutes.
        </p>
        {error && <p className="mt-2 text-xs text-bear">{error}</p>}
        {notice && <p className="mt-2 text-xs text-bull">{notice}</p>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel
            title={
              current
                ? `${current.symbol} · ${current.timeframe} · h${current.horizon}`
                : "Backtest result"
            }
            action={
              current ? (
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      current.status === "completed" ? "bull" : current.status === "failed" ? "bear" : "warn"
                    }
                  >
                    {current.status}
                  </Badge>
                  <a
                    href={backtestExportUrl(current.id)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Download className="h-3 w-3" /> CSV
                  </a>
                </div>
              ) : undefined
            }
          >
            {loadingRun ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-mute">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading saved run…
              </div>
            ) : current ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <Stat
                    label="Windows"
                    value={`${current.windows ?? current.windowCount}/${current.windowCount}`}
                    hint={current.skipped ? `${current.skipped} failed` : "evaluated"}
                  />
                  <Stat
                    label="Trend accuracy"
                    value={
                      metrics?.trend_directional_accuracy != null
                        ? `${(metrics.trend_directional_accuracy * 100).toFixed(0)}%`
                        : "—"
                    }
                    tone={
                      metrics?.trend_directional_accuracy == null
                        ? undefined
                        : metrics.trend_directional_accuracy >= 0.5
                          ? "bull"
                          : "bear"
                    }
                  />
                  <Stat
                    label="Body direction"
                    value={metrics ? `${(metrics.directional_accuracy * 100).toFixed(0)}%` : "—"}
                  />
                  <Stat label="Close MAE" value={metrics ? metrics.mae.close.toFixed(4) : "—"} />
                  <Stat label="Close RMSE" value={metrics ? metrics.rmse.close.toFixed(4) : "—"} />
                  <Stat
                    label="Avg inference"
                    value={avgInference != null ? `${avgInference.toFixed(0)} ms` : "—"}
                    hint={current.error ?? "per window"}
                  />
                </div>

                <div className="mt-4">
                  <MetricsTable metrics={metrics} />
                </div>

                {current.points?.length ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-[10px] uppercase tracking-widest text-mute">Window</span>
                      {current.points.map((p) => (
                        <button
                          key={p.window}
                          onClick={() => setSelectedWindow(p.window - 1)}
                          className={cn(
                            "rounded-md border px-2 py-1 font-mono text-[11px] transition",
                            selectedWindow === p.window - 1
                              ? "border-accent/40 bg-accent/10 text-ink"
                              : "border-white/10 bg-secondary text-mute hover:text-ink",
                            p.ok ? "" : "opacity-60",
                          )}
                          title={
                            p.error
                              ? p.error
                              : `${formatTime(p.contextStart)} → ${formatTime(p.contextEnd)}`
                          }
                        >
                          W{p.window}
                          {p.ok ? "" : " ×"}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3">
                      {point?.predicted ? (
                        loadingContext ? (
                          <div className="flex h-[360px] items-center justify-center gap-2 text-sm text-mute">
                            <RefreshCw className="h-4 w-4 animate-spin" /> Loading context candles…
                          </div>
                        ) : (
                          <CandleChart
                            candles={context}
                            predicted={point.predicted}
                            actual={point.actual}
                            indicators={null}
                            show={{ ema: false, sma: false, bb: false, vwap: false, volume: true }}
                            uncertaintyStd={null}
                            height={380}
                          />
                        )
                      ) : (
                        <div className="rounded-lg border border-bear/30 bg-bear/10 p-3 text-xs leading-5 text-bear">
                          {point?.error ?? "This window has no stored forecast."}
                        </div>
                      )}
                    </div>

                    {point && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Stat
                          label="Origin close"
                          value={formatPrice(point.contextLastClose)}
                          hint={formatTime(point.contextEnd)}
                        />
                        <Stat
                          label="Predicted horizon move"
                          value={formatPercent(
                            point.predicted?.length
                              ? (point.predicted[point.predicted.length - 1].close / point.contextLastClose - 1) * 100
                              : null,
                          )}
                          tone={
                            point.metrics?.predicted_trend === "Bullish"
                              ? "bull"
                              : point.metrics?.predicted_trend === "Bearish"
                                ? "bear"
                                : undefined
                          }
                        />
                        <Stat
                          label="Actual horizon move"
                          value={formatPercent(
                            point.actual.length
                              ? (point.actual[point.actual.length - 1].close / point.contextLastClose - 1) * 100
                              : null,
                          )}
                          tone={
                            point.metrics?.actual_trend === "Bullish"
                              ? "bull"
                              : point.metrics?.actual_trend === "Bearish"
                                ? "bear"
                                : undefined
                          }
                        />
                      </div>
                    )}

                    {point?.predicted && point.actual.length > 0 && (
                      <div className="mt-4 overflow-auto">
                        <h3 className="mb-2 text-xs font-semibold">Window W{point.window} predicted vs realized</h3>
                        <table className="w-full min-w-[520px] font-mono text-[11px]">
                          <thead className="text-[9px] uppercase tracking-widest text-mute">
                            <tr>
                              <th className="pb-1 text-left font-medium">Time</th>
                              <th className="pb-1 text-right font-medium">Pred close</th>
                              <th className="pb-1 text-right font-medium">Actual close</th>
                              <th className="pb-1 text-right font-medium">Δ</th>
                              <th className="pb-1 text-right font-medium">Pred dir</th>
                              <th className="pb-1 text-right font-medium">Actual dir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {point.predicted.map((candle, i) => {
                              const real = point.actual[i];
                              if (!real) return null;
                              const delta = candle.close - real.close;
                              const predDir = candle.close >= candle.open ? "up" : "down";
                              const actualDir = real.close >= real.open ? "up" : "down";
                              return (
                                <tr key={candle.timestamp} className="border-t border-white/5 text-mute">
                                  <td className="py-1">{formatTime(candle.timestamp)}</td>
                                  <td className="py-1 text-right text-ink">{formatPrice(candle.close)}</td>
                                  <td className="py-1 text-right">{formatPrice(real.close)}</td>
                                  <td
                                    className={cn(
                                      "py-1 text-right",
                                      delta >= 0 ? "text-bull" : "text-bear",
                                    )}
                                  >
                                    {delta >= 0 ? "+" : ""}
                                    {formatPrice(delta)}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-1 text-right",
                                      predDir === actualDir ? "text-bull" : "text-bear",
                                    )}
                                  >
                                    {predDir}
                                  </td>
                                  <td className="py-1 text-right">{actualDir}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm text-mute">
                    This saved run has no per-window points. Run a new backtest to store forecasts and realized candles.
                  </p>
                )}
              </>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-mute">
                <FolderOpen className="h-5 w-5" />
                No backtest selected. Run one or choose a saved run.
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Saved runs" className="h-fit">
          <div className="max-h-[720px] space-y-2 overflow-auto pr-1">
            {runs.map((item) => (
              <button
                key={item.id}
                onClick={() => void openRun(item.id)}
                disabled={loadingRun}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50",
                  current?.id === item.id
                    ? "border-accent/40 bg-accent/10"
                    : "border-transparent bg-secondary hover:bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">
                    {item.symbol} · {item.timeframe} · h{item.horizon}
                  </span>
                  <Badge
                    tone={item.status === "completed" ? "bull" : item.status === "failed" ? "bear" : "warn"}
                  >
                    {item.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-mute">
                  <span>
                    {timeAgo(item.createdAt)} · {item.windowCount} windows
                  </span>
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {item.lookback} lookback
                  </span>
                </div>
                {item.metrics && (
                  <div className="mt-1 flex gap-3 font-mono text-[10px] text-mute">
                    <span>close MAE {item.metrics.mae?.close?.toFixed(4) ?? "—"}</span>
                    <span>
                      trend{" "}
                      {item.metrics.trend_directional_accuracy != null
                        ? `${(item.metrics.trend_directional_accuracy * 100).toFixed(0)}%`
                        : "—"}
                    </span>
                  </div>
                )}
              </button>
            ))}
            {!runs.length && (
              <p className="text-sm text-mute">No backtests stored yet. Configure the run above.</p>
            )}
          </div>
          <p className="mt-3 text-[10px] leading-4 text-mute">
            Saved runs keep their per-window forecasts so you can replay them even after newer candles arrive.
          </p>
        </Panel>
      </div>
    </div>
  );
}
