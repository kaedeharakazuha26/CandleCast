import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  Clock3,
  Gauge,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { CandleChart } from "../charts/CandleChart";
import { Badge, Panel, Stat, Toggle } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { useIndicators } from "../hooks/useIndicators";
import { useMarket } from "../hooks/useMarket";
import {
  fetchAccuracy,
  fetchHistory,
  fetchModelInfo,
  fetchSymbols,
  generatePrediction,
} from "../services/api";
import { useTerminal } from "../store/terminal";
import type { AccuracyResponse, HistoryItem, Timeframe } from "../types/market";
import { cn } from "../utils/cn";
import {
  directionTone,
  formatCompact,
  formatPercent,
  formatPrice,
  formatTime,
  timeAgo,
} from "../utils/format";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const HORIZONS = [1, 3, 5, 10, 20, 50];
const LOOKBACKS = [128, 256, 400, 512];
const COMMON = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

export function Dashboard() {
  useMarket();
  useIndicators();
  const store = useTerminal();
  const [symbols, setSymbols] = useState<string[]>(COMMON);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);
  const [model, setModel] = useState<Awaited<ReturnType<typeof fetchModelInfo>> | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [pairDraft, setPairDraft] = useState(store.symbol);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    fetchSymbols()
      .then((list) => setSymbols(list))
      .catch(() => undefined);
    fetchModelInfo()
      .then((info) => {
        setModel(info);
        setModelError(null);
      })
      .catch(() => setModelError("AI inference service unreachable"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchHistory({ symbol: store.symbol, timeframe: store.timeframe, limit: 8 })
      .then((items) => {
        if (!cancelled) setRecent(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store.symbol, store.timeframe, store.prediction]);

  useEffect(() => {
    fetchAccuracy()
      .then(setAccuracy)
      .catch(() => undefined);
  }, [store.prediction]);

  useEffect(() => {
    setPairDraft(store.symbol);
  }, [store.symbol]);

  useEffect(() => {
    if (!store.loadingPrediction) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [store.loadingPrediction]);

  async function runForecast() {
    store.setLoadingPrediction(true);
    store.setError(null);
    try {
      const payload = await generatePrediction({
        symbol: store.symbol,
        timeframe: store.timeframe,
        horizon: store.horizon,
        lookback: store.lookback,
        uncertainty_samples: store.uncertaintySamples,
        scenarios: store.scenarios,
      });
      store.setPrediction(payload);
      store.setPredicted(payload.primary.result.predicted, payload.primary.result.sample_close_std);
      store.setActual([]);
      setLastRunAt(Date.now());
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown; error?: string } } }).response?.data;
      store.setError(
        typeof detail?.detail === "string"
          ? detail.detail
          : detail?.error ?? "Kronos inference failed. The service does not return mock candles.",
      );
    } finally {
      store.setLoadingPrediction(false);
    }
  }

  function commitPair() {
    const next = pairDraft.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(next)) {
      setPairDraft(store.symbol);
      return;
    }
    if (next !== store.symbol) store.setSymbol(next);
  }

  const ticker = store.ticker;
  const prediction = store.prediction;
  const analysis = prediction?.primary.analysis;
  const changeUp = (ticker?.change24h ?? 0) >= 0;
  const lastCandle = store.candles[store.candles.length - 1];
  const price = lastCandle?.close ?? ticker?.price ?? 0;
  const indicators = store.indicatorSeries;
  const latest = prediction?.indicators ?? indicators?.latest ?? {};
  const signalTone = directionTone(analysis?.signal.direction);
  const directionBadgeTone = directionTone(analysis?.marketDirection);

  const filteredSymbols = useMemo(() => {
    const common = COMMON.filter((s) => symbols.includes(s));
    return [...new Set([...common, ...symbols])].slice(0, 600);
  }, [symbols]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-4">
        <div className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Pair"
            value={store.symbol}
            hint={`${store.timeframe} · ${store.candles.length} bars`}
          />
          <Stat
            label="Last price"
            value={price ? formatPrice(price) : "—"}
            tone={changeUp ? "bull" : "bear"}
            hint={lastCandle ? `Close ${formatPrice(lastCandle.close)}` : undefined}
          />
          <Stat
            label="24h change"
            value={ticker ? formatPercent(ticker.change24h) : "—"}
            tone={changeUp ? "bull" : "bear"}
            hint={ticker ? `Vol ${formatCompact(ticker.volume24h)}` : undefined}
          />
          <Stat
            label="24h range"
            value={ticker ? `${formatPrice(ticker.low24h)} – ${formatPrice(ticker.high24h)}` : "—"}
            hint={ticker ? `Quote vol ${formatCompact(ticker.quoteVolume24h)}` : undefined}
          />
          <Stat
            label="AI engine"
            value={
              model?.loaded ? (
                <span className="text-bull">Kronos ready</span>
              ) : modelError ? (
                <span className="text-bear">Offline</span>
              ) : (
                <span className="text-mute">Checking…</span>
              )
            }
            hint={model?.device ? `${model.device} · ${model.model_version ?? "kronos-base"}` : "Waiting for inference"}
          />
          <Stat
            label="Last forecast"
            value={lastRunAt ? timeAgo(lastRunAt) : prediction ? "from history" : "—"}
            hint={
              analysis
                ? `${analysis.uncertainty.source === "independent-passes" ? `${analysis.uncertainty.passes} σ passes` : "single pass"}`
                : "No forecast this session"
            }
          />
        </div>

        <div className="panel min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex min-w-[160px] flex-1 items-center gap-2">
              <Input
                list="symbol-options"
                value={pairDraft}
                onChange={(e) => setPairDraft(e.target.value.toUpperCase())}
                onBlur={commitPair}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPair();
                }}
                className="max-w-[180px] font-mono"
                aria-label="Trading pair"
              />
              <datalist id="symbol-options">
                {filteredSymbols.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => store.setTimeframe(tf)}
                    className={cn(
                      "px-2 py-1.5 text-[11px] transition",
                      store.timeframe === tf
                        ? "bg-accent/20 text-ink"
                        : "bg-secondary/60 text-mute hover:bg-white/5 hover:text-ink",
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <Select
              value={String(store.horizon)}
              onChange={(e) => store.setHorizon(Number(e.target.value))}
              aria-label="Forecast horizon"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  Next {h} candle{h > 1 ? "s" : ""}
                </option>
              ))}
            </Select>
            <Select
              value={String(store.lookback)}
              onChange={(e) => store.setLookback(Number(e.target.value))}
              aria-label="Model lookback"
            >
              {LOOKBACKS.map((n) => (
                <option key={n} value={n}>
                  Lookback {n}
                </option>
              ))}
            </Select>
            <Select
              value={String(store.uncertaintySamples)}
              onChange={(e) => store.setUncertaintySamples(Number(e.target.value))}
              aria-label="Uncertainty passes"
              title="Extra independent Kronos passes used to measure sample dispersion"
            >
              <option value="0">Single pass</option>
              <option value="2">σ from 2 passes</option>
              <option value="3">σ from 3 passes</option>
              <option value="4">σ from 4 passes</option>
            </Select>
            <Toggle
              checked={store.scenarios}
              onChange={store.setScenarios}
              label="Multi-scenario"
              title="Runs separate Kronos forecasts for 5, 20 and 50 candles"
            />
            <Button onClick={() => void runForecast()} disabled={store.loadingPrediction || !model?.loaded}>
              {store.loadingPrediction ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Kronos {elapsed}s
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate forecast
                </>
              )}
            </Button>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-mute">Overlays</span>
              <Toggle
                checked={store.indicators.ema}
                onChange={() => store.toggleIndicator("ema")}
                label="EMA 9 / 20 / 50 / 200"
              />
              <Toggle checked={store.indicators.sma} onChange={() => store.toggleIndicator("sma")} label="SMA 20" />
              <Toggle
                checked={store.indicators.bb}
                onChange={() => store.toggleIndicator("bb")}
                label="Bollinger"
              />
              <Toggle checked={store.indicators.vwap} onChange={() => store.toggleIndicator("vwap")} label="VWAP" />
              <Toggle
                checked={store.indicators.volume}
                onChange={() => store.toggleIndicator("volume")}
                label="Volume"
              />
            </div>
            <div className="flex items-center gap-3 text-[10px] text-mute">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-bull" /> actual
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm border border-[#60A5FA] bg-accent/20" /> Kronos
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm border border-[#FBBF24] bg-amber-400/20" /> realized
              </span>
            </div>
          </div>

          {store.loadingMarket ? (
            <div className="flex h-[420px] items-center justify-center text-sm text-mute md:h-[520px]">
              Loading Binance candles…
            </div>
          ) : store.candles.length ? (
            <CandleChart
              candles={store.candles}
              predicted={store.predicted}
              actual={store.actual}
              indicators={indicators}
              show={store.indicators}
              uncertaintyStd={store.uncertaintyStd}
            />
          ) : (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-sm text-mute md:h-[520px]">
              <TriangleAlert className="h-5 w-5 text-bear" />
              No candle data. Check the pair symbol or Binance connectivity.
            </div>
          )}
          <p className="mt-2 text-[11px] leading-5 text-mute">
            Solid green/red candles are historical Binance data. Blue-bordered candles are Kronos estimates starting
            after the last closed bar. Amber candles are realized outcomes in replay. Forecasts are sampled paths, not
            guaranteed prices.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title="Recent forecasts"
            action={
              <Link to="/history" className="text-xs text-accent hover:underline">
                History →
              </Link>
            }
          >
            <div className="space-y-2 text-sm">
              {recent.slice(0, 6).map((row) => (
                <Link
                  key={row.id}
                  to="/history"
                  className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 transition hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">
                      {row.symbol} · {row.timeframe} · h{row.horizon}
                    </div>
                    <div className="text-[10px] text-mute">{timeAgo(row.createdAt)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={directionTone(row.direction)}>{row.direction ?? "—"}</Badge>
                    {row.evaluatedAt && (
                      <span className="font-mono text-[10px] text-mute">
                        {row.metrics?.trend_directional_accuracy != null
                          ? `${(row.metrics.trend_directional_accuracy * 100).toFixed(0)}% dir`
                          : "evaluated"}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {!recent.length && <p className="text-mute">No stored forecasts for this pair and timeframe.</p>}
            </div>
          </Panel>

          <Panel title="Scenario comparison">
            {prediction?.scenarios ? (
              <div className="space-y-2 text-sm">
                {prediction.scenarios.map((s) => (
                  <button
                    key={s.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-left transition hover:bg-white/5",
                      s.id === prediction.primary.id && "ring-1 ring-accent/40",
                    )}
                    onClick={() =>
                      store.setPredicted(s.result.predicted, s.result.sample_close_std)
                    }
                  >
                    <span className="text-xs">
                      Next {s.horizon} · {s.analysis.marketDirection}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs",
                        s.analysis.predictedPrice.percentMove >= 0 ? "text-bull" : "text-bear",
                      )}
                    >
                      {formatPercent(s.analysis.predictedPrice.percentMove)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mute">
                Enable multi-scenario to run independent 5, 20 and 50 candle Kronos forecasts on the same context.
              </p>
            )}
          </Panel>

          <Panel
            title="Stored forecast accuracy"
            action={
              <Link to="/history" className="text-xs text-accent hover:underline">
                Evaluate →
              </Link>
            }
          >
            {accuracy?.overall ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-mute">Trend direction accuracy</span>
                  <span className="font-mono text-bull">
                    {accuracy.overall.trend_directional_accuracy != null
                      ? `${(accuracy.overall.trend_directional_accuracy * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-mute">Close MAE</span>
                  <span className="font-mono">
                    {accuracy.overall.mae?.close != null ? accuracy.overall.mae.close.toFixed(4) : "—"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-mute">Evaluated windows</span>
                  <span className="font-mono">
                    {accuracy.totals.evaluated} / {accuracy.totals.predictions}
                  </span>
                </div>
                <p className="text-[10px] leading-4 text-mute">
                  Out-of-sample only. Pending forecasts are excluded until their future candles close.
                </p>
              </div>
            ) : (
              <p className="text-sm text-mute">
                No forecast has completed future candles yet. Accuracy will appear after real outcomes exist — it is
                never estimated.
              </p>
            )}
          </Panel>
        </div>
      </section>

      <aside className="min-w-0 space-y-4">
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold">AI prediction</span>
            </div>
          }
          action={analysis ? <Badge tone={directionBadgeTone}>{analysis.marketDirection}</Badge> : undefined}
        >
          {store.error && (
            <div className="rounded-lg border border-bear/30 bg-bear/10 p-3 text-xs leading-5 text-bear">
              {store.error}
            </div>
          )}
          {!analysis && !store.loadingPrediction && !store.error && (
            <div className="space-y-3 text-sm text-mute">
              <p>Run a forecast to populate Kronos OHLCV estimates for this pair and timeframe.</p>
              <div className="rounded-lg bg-secondary p-3 text-[11px] leading-5">
                Model: {model?.model_id ?? "NeoQuasar/Kronos-base"}
                <br />
                Max context: {model?.max_context ?? 512} bars · Horizon limit: {model?.max_pred_len ?? 120}
                <br />
                {modelError ? "Inference service is offline." : "The model is loaded once and reused for every request."}
              </div>
            </div>
          )}
          {store.loadingPrediction && (
            <div className="space-y-2 text-sm text-accent">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Autoregressive generation · {elapsed}s
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
              </div>
              <p className="text-[11px] leading-5 text-mute">
                Kronos is sampling future candles. Additional σ passes and multi-scenario runs take proportionally
                longer on CPU.
              </p>
            </div>
          )}
          {analysis && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={directionBadgeTone}>{analysis.marketDirection}</Badge>
                <Badge tone={signalTone}>
                  {analysis.signal.direction === "Strong Bullish" || analysis.signal.direction === "Bullish" ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : analysis.signal.direction === "Strong Bearish" || analysis.signal.direction === "Bearish" ? (
                    <ArrowDownRight className="h-3 w-3" />
                  ) : (
                    <Activity className="h-3 w-3" />
                  )}
                  {analysis.signal.direction}
                </Badge>
                <Badge tone={analysis.signal.risk === "Elevated" ? "warn" : "muted"}>
                  Risk {analysis.signal.risk}
                </Badge>
                <Badge tone="accent">
                  <Gauge className="h-3 w-3" />
                  {prediction?.primary.result.inference_ms.toFixed(0)} ms
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary p-3">
                <Stat
                  label="Next close"
                  value={formatPrice(analysis.predictedPrice.nextClose)}
                  tone={analysis.predictedPrice.percentMove >= 0 ? "bull" : "bear"}
                />
                <Stat
                  label="Horizon move"
                  value={formatPercent(analysis.predictedPrice.percentMove)}
                  tone={analysis.predictedPrice.percentMove >= 0 ? "bull" : "bear"}
                />
                <Stat
                  label="Close range"
                  value={`${formatPrice(analysis.predictedPrice.range.min)} – ${formatPrice(analysis.predictedPrice.range.max)}`}
                />
                <Stat
                  label="High / low envelope"
                  value={`${formatPrice(analysis.predictedPrice.range.low)} – ${formatPrice(analysis.predictedPrice.range.high)}`}
                />
              </div>

              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-mute">
                  <span>Forecast dispersion</span>
                  <span>{analysis.uncertainty.source === "independent-passes" ? `${analysis.uncertainty.passes} passes` : "single pass"}</span>
                </div>
                {analysis.uncertainty.closeStdFinal != null ? (
                  <>
                    <div className="font-mono text-sm text-ink">
                      ±{formatPrice(analysis.uncertainty.closeStdFinal)} · 1σ final close
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-mute">
                      band {formatPrice(analysis.uncertainty.closeBand.lower)} – {formatPrice(analysis.uncertainty.closeBand.upper)}
                    </div>
                  </>
                ) : (
                  <div className="font-mono text-[11px] leading-5 text-mute">
                    Path envelope {formatPrice(analysis.uncertainty.closeBand.lower)} – {formatPrice(analysis.uncertainty.closeBand.upper)}
                  </div>
                )}
                <p className="mt-1 text-[10px] leading-4 text-mute">{analysis.uncertainty.note}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <Row label="Short term" value={analysis.trend.shortTerm} />
                <Row label="Medium term" value={analysis.trend.mediumTerm} />
                <Row label="Momentum" value={analysis.trend.momentum} />
                <Row label="Volatility" value={analysis.trend.volatility} />
                <Row label="Model" value={prediction?.primary.result.model_version ?? "kronos-base"} />
                <Row label="Lookback" value={`${prediction?.primary.result.lookback ?? store.lookback} bars`} />
              </div>

              <p className="rounded-lg bg-secondary p-3 text-[11px] leading-5 text-mute">{analysis.explanation}</p>

              {analysis.signal.supporting.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-mute">Supporting indicators</div>
                  <div className="flex flex-wrap gap-1">
                    {analysis.signal.supporting.map((s) => (
                      <Badge key={s} tone="muted">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(prediction?.primary.result.transformations.length ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-[10px] leading-4 text-amber-200">
                  {prediction?.primary.result.transformations.length} predicted candle(s) were repaired by the AI
                  service to satisfy OHLC invariants. Repairs are logged and stored on the prediction record.
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Predicted candles"
          action={
            prediction ? (
              <span className="flex items-center gap-1 text-[10px] text-mute">
                <Clock3 className="h-3 w-3" />
                {formatTime(store.predicted[0]?.timestamp)}
              </span>
            ) : undefined
          }
        >
          <div className="max-h-64 overflow-auto font-mono text-[11px]">
            {store.predicted.length ? (
              <table className="w-full">
                <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-widest text-mute">
                  <tr>
                    <th className="pb-1 text-left font-medium">Time</th>
                    <th className="pb-1 text-right font-medium">O</th>
                    <th className="pb-1 text-right font-medium">H</th>
                    <th className="pb-1 text-right font-medium">L</th>
                    <th className="pb-1 text-right font-medium">C</th>
                    <th className="pb-1 text-right font-medium">Vol</th>
                  </tr>
                </thead>
                <tbody>
                  {store.predicted.map((c) => (
                    <tr key={c.timestamp} className="border-t border-white/5 text-mute">
                      <td className="py-1 pr-1 text-[9px]">{new Date(c.timestamp).toLocaleTimeString()}</td>
                      <td className="py-1 text-right">{formatPrice(c.open)}</td>
                      <td className="py-1 text-right text-bull">{formatPrice(c.high)}</td>
                      <td className="py-1 text-right text-bear">{formatPrice(c.low)}</td>
                      <td className="py-1 text-right text-ink">{formatPrice(c.close)}</td>
                      <td className="py-1 text-right">{formatCompact(c.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-mute">No forecast candles in this session.</p>
            )}
          </div>
        </Panel>

        <Panel title="Technical context">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {[
              ["RSI 14", latest.rsi],
              ["Stoch RSI", latest.stochRsi != null ? latest.stochRsi * 100 : null],
              ["MACD", latest.macd],
              ["Signal", latest.macdSignal],
              ["EMA 9", latest.ema9],
              ["EMA 20", latest.ema20],
              ["EMA 50", latest.ema50],
              ["EMA 200", latest.ema200],
              ["SMA 20", latest.sma20],
              ["ATR 14", latest.atr],
              ["VWAP", latest.vwap],
              ["BB upper", latest.bbUpper],
              ["BB lower", latest.bbLower],
            ].map(([label, value]) => (
              <Row
                key={String(label)}
                label={String(label)}
                value={value == null ? "—" : Number(value).toFixed(label === "RSI 14" || label === "Stoch RSI" ? 2 : 4)}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-mute">
            Indicators are computed from closed Binance candles and complement Kronos; they do not override model
            output.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-mute">{label}</span>
      <span className={cn("truncate font-mono", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>
        {value}
      </span>
    </div>
  );
}
