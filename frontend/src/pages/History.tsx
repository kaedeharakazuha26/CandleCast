import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { CandleChart } from "../charts/CandleChart";
import { Badge, Panel, Stat, Toggle } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/input";
import { MetricsTable } from "../components/MetricsTable";
import {
  evaluatePendingPredictions,
  exportHistoryUrl,
  exportUrl,
  fetchAccuracy,
  fetchHistory,
  fetchKlines,
  fetchPrediction,
  fetchSymbols,
} from "../services/api";
import { useTerminal } from "../store/terminal";
import type {
  AccuracyGroup,
  AccuracyResponse,
  Candle,
  PredictionDetail,
  Timeframe,
} from "../types/market";
import {
  directionTone,
  formatPercent,
  formatPrice,
  formatTime,
  timeAgo,
} from "../utils/format";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const TF_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

export function History() {
  const symbol = useTerminal((s) => s.symbol);
  const timeframe = useTerminal((s) => s.timeframe);
  const setSymbol = useTerminal((s) => s.setSymbol);
  const setTimeframe = useTerminal((s) => s.setTimeframe);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [items, setItems] = useState<PredictionDetail[]>([]);
  const [selected, setSelected] = useState<PredictionDetail | null>(null);
  const [context, setContext] = useState<Candle[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);
  const [evaluatedOnly, setEvaluatedOnly] = useState(false);
  const [horizon, setHorizon] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchSymbols().then(setSymbols).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchHistory({ symbol, timeframe, horizon: horizon === "" ? undefined : horizon, limit: 100 })
      .then((rows) => {
        setItems(rows as PredictionDetail[]);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    fetchAccuracy().then(setAccuracy).catch(() => undefined);
  }, [symbol, timeframe, horizon]);

  const visible = useMemo(
    () => (evaluatedOnly ? items.filter((item) => item.metrics != null) : items),
    [items, evaluatedOnly],
  );

  async function evaluatePending() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await evaluatePendingPredictions();
      setNotice(
        `Checked ${result.checked} forecasts · ${result.evaluated} newly evaluated · ${result.waiting} still waiting for future candles.`,
      );
      const [rows, acc] = await Promise.all([
        fetchHistory({ symbol, timeframe, horizon: horizon === "" ? undefined : horizon, limit: 100 }),
        fetchAccuracy(),
      ]);
      setItems(rows as PredictionDetail[]);
      setAccuracy(acc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  async function openReplay(id: string) {
    setError(null);
    try {
      const row = await fetchPrediction(id);
      setSelected(row);
      if (row.context?.length) {
        setContext(row.context);
        return;
      }
      // Legacy records created before context storage: load a bounded window
      // ending at the forecast origin.
      const tf = row.timeframe as Timeframe;
      const cut = Number(row.marketTimestamp);
      const start = cut - TF_MS[tf] * 220;
      const candles = await fetchKlines(row.symbol, tf, 300, { startTime: start, endTime: cut + TF_MS[tf] });
      setContext(candles.filter((c) => c.timestamp <= cut).slice(-220));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load prediction");
    }
  }

  const metrics = selected?.metrics ?? null;
  const comparison = useMemo(() => {
    if (!selected) return [];
    const n = Math.min(selected.predicted.length, selected.actual.length);
    return Array.from({ length: n }, (_, i) => ({
      timestamp: selected.predicted[i].timestamp,
      predicted: selected.predicted[i],
      actual: selected.actual[i],
    }));
  }, [selected]);

  const uncertaintyStd = selected?.sampleCloseStd ?? null;
  const contextClose = context[context.length - 1]?.close;
  const predictedMove =
    selected?.predicted.length && contextClose
      ? (selected.predicted[selected.predicted.length - 1].close / contextClose - 1) * 100
      : null;
  const actualMove =
    selected?.actual.length && contextClose
      ? (selected.actual[selected.actual.length - 1].close / contextClose - 1) * 100
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Panel className="lg:col-span-2 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-mute">Stored forecast accuracy</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl text-bull">
                  {accuracy?.overall?.trend_directional_accuracy != null
                    ? `${(accuracy.overall.trend_directional_accuracy * 100).toFixed(1)}%`
                    : "—"}
                </span>
                <span className="text-xs text-mute">trend direction</span>
              </div>
            </div>
            <div className="text-right text-[11px] text-mute">
              <div>
                {accuracy?.totals.evaluated ?? 0} evaluated / {accuracy?.totals.predictions ?? 0} stored
              </div>
              <div>{accuracy?.totals.pending ?? 0} awaiting future candles</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Close MAE"
              value={accuracy?.overall?.mae?.close != null ? accuracy.overall.mae.close.toFixed(4) : "—"}
            />
            <Stat
              label="Body direction"
              value={
                accuracy?.overall?.directional_accuracy != null
                  ? `${(accuracy.overall.directional_accuracy * 100).toFixed(1)}%`
                  : "—"
              }
            />
            <Stat
              label="Bull windows"
              value={
                accuracy?.overall?.bullish_directional_accuracy != null
                  ? `${(accuracy.overall.bullish_directional_accuracy * 100).toFixed(0)}%`
                  : "—"
              }
              hint={`${accuracy?.overall?.bullish_windows ?? 0} samples`}
            />
            <Stat
              label="Bear windows"
              value={
                accuracy?.overall?.bearish_directional_accuracy != null
                  ? `${(accuracy.overall.bearish_directional_accuracy * 100).toFixed(0)}%`
                  : "—"
              }
              hint={`${accuracy?.overall?.bearish_windows ?? 0} samples`}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void evaluatePending()} disabled={busy}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Evaluate mature forecasts
            </Button>
            <a
              href={exportHistoryUrl({ symbol, timeframe, horizon: horizon === "" ? undefined : horizon })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
            >
              <Download className="h-4 w-4" /> Export history CSV
            </a>
            {notice && <span className="text-[11px] text-bull">{notice}</span>}
          </div>
          {accuracy?.note && <p className="mt-2 text-[10px] leading-4 text-mute">{accuracy.note}</p>}
        </Panel>

        <Panel title="By symbol">
          <AccuracyList rows={accuracy?.bySymbol ?? []} />
        </Panel>
        <Panel title="By horizon">
          <AccuracyList rows={accuracy?.byHorizon ?? []} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel className="min-w-0">
          <div className="space-y-2">
            <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {[...new Set([symbol, ...symbols])].slice(0, 500).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
                {TIMEFRAMES.map((tf) => (
                  <option key={tf}>{tf}</option>
                ))}
              </Select>
              <Select value={String(horizon)} onChange={(e) => setHorizon(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">All horizons</option>
                {[1, 3, 5, 10, 20, 50].map((h) => (
                  <option key={h} value={h}>
                    h{h}
                  </option>
                ))}
              </Select>
            </div>
            <Toggle checked={evaluatedOnly} onChange={setEvaluatedOnly} label="Only evaluated forecasts" />
          </div>
          {error && <p className="mt-2 text-xs text-bear">{error}</p>}
          <div className="mt-3 max-h-[640px] space-y-2 overflow-auto pr-1">
            {visible.map((item) => (
              <button
                key={item.id}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selected?.id === item.id
                    ? "border-accent/40 bg-accent/10"
                    : "border-transparent bg-secondary hover:bg-white/5"
                }`}
                onClick={() => void openReplay(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">
                    {item.symbol} · {item.timeframe} · h{item.horizon}
                  </span>
                  <Badge tone={directionTone(item.direction)}>{item.direction ?? "—"}</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-mute">
                  <span>{timeAgo(item.createdAt)}</span>
                  <span>{item.evaluatedAt ? "evaluated" : "pending"}</span>
                </div>
                {item.metrics && (
                  <div className="mt-1 flex gap-3 font-mono text-[10px] text-mute">
                    <span>close MAE {item.metrics.mae.close?.toFixed(4)}</span>
                    <span>
                      dir{" "}
                      {item.metrics.trend_directional_accuracy != null
                        ? `${(item.metrics.trend_directional_accuracy * 100).toFixed(0)}%`
                        : "—"}
                    </span>
                  </div>
                )}
              </button>
            ))}
            {!visible.length && <p className="text-sm text-mute">No forecasts match these filters.</p>}
          </div>
        </Panel>

        <Panel className="min-w-0">
          {selected ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Prediction replay</h2>
                  <div className="text-[11px] text-mute">
                    {selected.symbol} · {selected.timeframe} · h{selected.horizon} · requested{" "}
                    {formatTime(selected.createdAt)} · {selected.modelVersion}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={exportUrl(selected.id)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Download className="h-3 w-3" /> CSV
                  </a>
                  <Badge tone={directionTone(selected.direction)}>{selected.direction ?? "—"}</Badge>
                  <Badge tone="muted">{selected.signal ?? "—"}</Badge>
                </div>
              </div>
              <CandleChart
                candles={context}
                predicted={selected.predicted}
                actual={selected.actual}
                indicators={null}
                show={{ ema: false, sma: false, bb: false, vwap: false, volume: true }}
                uncertaintyStd={uncertaintyStd}
                height={430}
              />
              <p className="mt-2 text-[11px] leading-5 text-mute">
                Blue: forecast stored at request time. Amber: realized candles after that timestamp.{" "}
                {uncertaintyStd?.length
                  ? "Dotted blue lines are ±1σ from independent Kronos passes."
                  : "No multi-pass dispersion was stored for this forecast."}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Predicted move"
                  value={predictedMove != null ? formatPercent(predictedMove) : "pending"}
                  tone={metrics?.predicted_trend === "Bullish" ? "bull" : metrics?.predicted_trend === "Bearish" ? "bear" : undefined}
                />
                <Stat
                  label="Actual move"
                  value={actualMove != null ? formatPercent(actualMove) : "pending"}
                  tone={metrics?.actual_trend === "Bullish" ? "bull" : metrics?.actual_trend === "Bearish" ? "bear" : undefined}
                />
                <Stat
                  label="Trend direction"
                  value={
                    metrics?.trend_directional_accuracy == null
                      ? "pending"
                      : metrics.trend_directional_accuracy
                        ? "hit"
                        : "miss"
                  }
                />
                <Stat
                  label="Close MAE / RMSE"
                  value={
                    metrics ? `${metrics.mae.close.toFixed(4)} / ${metrics.rmse.close.toFixed(4)}` : "pending"
                  }
                />
              </div>

              {metrics && <MetricsTable metrics={metrics} />}

              {comparison.length > 0 && (
                <div className="mt-4 overflow-auto">
                  <h3 className="mb-2 text-xs font-semibold">Predicted vs realized</h3>
                  <table className="w-full min-w-[560px] font-mono text-[11px]">
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
                      {comparison.map((row) => {
                        const delta = row.predicted.close - row.actual.close;
                        const predDir = row.predicted.close >= row.predicted.open ? "up" : "down";
                        const actualDir = row.actual.close >= row.actual.open ? "up" : "down";
                        return (
                          <tr key={row.timestamp} className="border-t border-white/5 text-mute">
                            <td className="py-1">{formatTime(row.timestamp)}</td>
                            <td className="py-1 text-right text-ink">{formatPrice(row.predicted.close)}</td>
                            <td className="py-1 text-right">{formatPrice(row.actual.close)}</td>
                            <td className={`py-1 text-right ${delta >= 0 ? "text-bull" : "text-bear"}`}>
                              {delta >= 0 ? "+" : ""}
                              {formatPrice(delta)}
                            </td>
                            <td className={`py-1 text-right ${predDir === "up" ? "text-bull" : "text-bear"}`}>{predDir}</td>
                            <td className={`py-1 text-right ${actualDir === "up" ? "text-bull" : "text-bear"}`}>{actualDir}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selected.explanation && (
                <p className="mt-4 rounded-lg bg-secondary p-3 text-[11px] leading-5 text-mute">
                  {selected.explanation}
                </p>
              )}
              {!selected.actual.length && (
                <p className="mt-3 text-[11px] text-amber-300">
                  Future candles for this forecast have not closed yet. Replay comparison appears automatically once
                  they do.
                </p>
              )}
            </>
          ) : (
            <div className="flex h-[420px] flex-col items-center justify-center gap-3 text-center text-sm text-mute">
              <ExternalLink className="h-5 w-5" />
              <p>Select a stored forecast to replay predicted versus realized candles.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function AccuracyList({ rows }: { rows: AccuracyGroup[] }) {
  if (!rows.length) return <p className="text-sm text-mute">No evaluated forecasts yet.</p>;
  return (
    <div className="space-y-2 text-xs">
      {rows.slice(0, 6).map((row) => (
        <div key={row.name} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-2.5 py-1.5">
          <span className="font-mono text-mute">{row.name}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-ink">
              {row.trend_directional_accuracy != null
                ? `${(row.trend_directional_accuracy * 100).toFixed(0)}%`
                : "—"}
            </span>
            <span className="text-[10px] text-mute">{row.runs ?? 0} runs</span>
          </span>
        </div>
      ))}
    </div>
  );
}
