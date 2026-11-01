import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Badge, Panel, Stat } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import {
  addAlert,
  addWatchlist,
  fetchAlerts,
  fetchSymbols,
  fetchWatchlist,
  removeAlert,
  removeWatchlist,
} from "../services/api";
import { useTickerStream } from "../hooks/useTickerStream";
import { useTerminal } from "../store/terminal";
import type { Alert, WatchlistItem } from "../types/market";
import { cn } from "../utils/cn";
import { directionTone, formatClock, formatPercent, formatPrice, timeAgo } from "../utils/format";

const COMMON = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

const ALERT_TYPES = [
  { value: "price_above", label: "Price above", needsValue: true, hint: "USDT price" },
  { value: "price_below", label: "Price below", needsValue: true, hint: "USDT price" },
  { value: "pct_move", label: "24h move reaches", needsValue: true, hint: "absolute percent" },
  { value: "bullish_prediction", label: "Bullish forecast", needsValue: false, hint: "fires on next forecast" },
  { value: "bearish_prediction", label: "Bearish forecast", needsValue: false, hint: "fires on next forecast" },
] as const;

function alertNeedsValue(type: string) {
  return ALERT_TYPES.some((t) => t.value === type && t.needsValue);
}

function alertLabel(type: string) {
  return ALERT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function Watchlist() {
  const navigate = useNavigate();
  const storeSymbol = useTerminal((s) => s.symbol);
  const setSymbol = useTerminal((s) => s.setSymbol);

  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [draft, setDraft] = useState(storeSymbol);
  const [alertSymbol, setAlertSymbol] = useState(storeSymbol);
  const [alertType, setAlertType] = useState<string>("price_above");
  const [alertValue, setAlertValue] = useState("");

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [creatingAlert, setCreatingAlert] = useState(false);
  const [removingAlert, setRemovingAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restUpdatedAt, setRestUpdatedAt] = useState<number | null>(null);

  async function refresh() {
    try {
      const [watch, alertRows] = await Promise.all([fetchWatchlist(), fetchAlerts()]);
      setItems(watch);
      setAlerts(alertRows);
      setRestUpdatedAt(Date.now());
      setError(null);
    } catch {
      setError("Watchlist or alerts could not be loaded. Check backend and database connectivity.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSymbols()
      .then((list) => setSymbols(list))
      .catch(() => undefined);

    let cancelled = false;
    const load = async () => {
      try {
        const [watch, alertRows] = await Promise.all([fetchWatchlist(), fetchAlerts()]);
        if (cancelled) return;
        setItems(watch);
        setAlerts(alertRows);
        setRestUpdatedAt(Date.now());
        setError(null);
      } catch {
        if (!cancelled) {
          setError("Watchlist or alerts could not be loaded. Check backend and database connectivity.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const symbolOptions = useMemo(() => [...new Set([...COMMON, ...symbols])].slice(0, 600), [symbols]);
  const watchSymbols = useMemo(() => items.map((item) => item.symbol), [items]);
  const { tickers: liveTickers, updatedAt: liveUpdatedAt } = useTickerStream(watchSymbols);
  const asOf = Math.max(liveUpdatedAt ?? 0, restUpdatedAt ?? 0) || null;
  const streamActive = liveUpdatedAt != null && liveUpdatedAt >= (restUpdatedAt ?? 0) - 5_000;
  const requiresValue = alertNeedsValue(alertType);
  const triggered = alerts.filter((a) => a.triggered).length;

  async function addSymbol() {
    const clean = draft.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(clean)) {
      setError("Enter a Binance USDT symbol such as BTCUSDT.");
      return;
    }
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      await addWatchlist(clean);
      setNotice(`${clean} is now on the watchlist.`);
      await refresh();
    } catch {
      setError(`Could not add ${clean}. The symbol must be a valid Binance market.`);
    } finally {
      setAdding(false);
    }
  }

  async function removeSymbol(item: WatchlistItem) {
    setRemoving(item.id);
    setError(null);
    try {
      await removeWatchlist(item.id);
      await refresh();
    } catch {
      setError(`Could not remove ${item.symbol}.`);
    } finally {
      setRemoving(null);
    }
  }

  async function createAlert() {
    const clean = alertSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(clean)) {
      setError("Alert symbol must look like BTCUSDT.");
      return;
    }
    let value: number | undefined;
    if (requiresValue) {
      value = Number(alertValue);
      if (!Number.isFinite(value) || value <= 0) {
        setError("This alert needs a positive numeric threshold.");
        return;
      }
    }
    setCreatingAlert(true);
    setError(null);
    setNotice(null);
    try {
      await addAlert({ symbol: clean, type: alertType, value });
      setAlertValue("");
      setNotice(
        requiresValue
          ? `${alertLabel(alertType)} alert armed for ${clean} at ${value}.`
          : `${alertLabel(alertType)} alert armed for ${clean}.`,
      );
      await refresh();
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(detail ?? "Could not create the alert.");
    } finally {
      setCreatingAlert(false);
    }
  }

  async function deleteAlert(alert: Alert) {
    setRemovingAlert(alert.id);
    setError(null);
    try {
      await removeAlert(alert.id);
      await refresh();
    } catch {
      setError("Could not delete the alert.");
    } finally {
      setRemovingAlert(null);
    }
  }

  function openTerminal(symbol: string) {
    setSymbol(symbol);
    navigate("/");
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Star className="h-4 w-4 text-accent" />
              Watchlist and alerts
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-mute">
              Prices stream from Binance miniTicker with a 20-second REST fallback. Price and percent alerts are
              evaluated server-side every 30 seconds; forecast alerts fire when a new Kronos run matches the chosen
              direction.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-5">
            <Stat label="Watched" value={items.length} hint="USDT pairs" />
            <Stat label="Alerts" value={alerts.length} hint={`${triggered} triggered`} />
            <Stat label="Monitor" value="30s" hint="server-side poll" />
          </div>
        </div>
      </Panel>

      {(error || notice) && (
        <div className="space-y-1">
          {error && (
            <div className="rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-xs text-bear">{error}</div>
          )}
          {notice && (
            <div className="rounded-lg border border-bull/30 bg-bull/10 px-3 py-2 text-xs text-bull">
              {notice}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Watched pairs"
          action={
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] text-mute">
                <span className={cn("h-1.5 w-1.5 rounded-full", streamActive ? "bg-bull" : "bg-amber-400")} />
                {streamActive ? "streaming" : "polling"} · as of {formatClock(asOf)}
              </span>
              <Badge tone="muted">{items.length} symbols</Badge>
            </div>
          }
        >
          <div className="mb-3 flex gap-2">
            <Input
              list="watch-symbols"
              value={draft}
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addSymbol();
              }}
              placeholder="BTCUSDT"
              className="font-mono"
              aria-label="Add watchlist symbol"
            />
            <datalist id="watch-symbols">
              {symbolOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button onClick={() => void addSymbol()} disabled={adding}>
              {adding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-mute">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading watchlist…
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const restTicker = item.ticker;
                const liveTicker = liveTickers[item.symbol];
                const liveFresh =
                  liveTicker != null && (!restUpdatedAt || (liveTicker.updatedAt ?? 0) >= restUpdatedAt);
                const ticker = liveFresh ? liveTicker : restTicker ?? liveTicker;
                const up = (ticker?.change24h ?? 0) >= 0;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2"
                  >
                    <button className="min-w-0 text-left" onClick={() => openTerminal(item.symbol)}>
                      <div className="flex items-center gap-2 font-mono text-sm text-ink">
                        {item.symbol}
                        {item.symbol === storeSymbol && <Badge tone="accent">active</Badge>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-mute">
                        <span>{ticker ? formatPrice(ticker.price) : "ticker unavailable"}</span>
                        {ticker && (
                          <span className={cn("font-mono", up ? "text-bull" : "text-bear")}>
                            {formatPercent(ticker.change24h)}
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      {item.latestPrediction ? (
                        <button
                          className="flex items-center gap-1.5"
                          onClick={() => navigate("/history")}
                          title="Open prediction history"
                        >
                          <Badge tone={directionTone(item.latestPrediction.direction)}>
                            {item.latestPrediction.direction ?? "—"}
                          </Badge>
                          <span className="font-mono text-[10px] text-mute">
                            {item.latestPrediction.timeframe} h{item.latestPrediction.horizon}
                          </span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-mute">no forecast</span>
                      )}
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => openTerminal(item.symbol)}
                      >
                        Forecast
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-bear"
                        disabled={removing === item.id}
                        onClick={() => void removeSymbol(item)}
                        aria-label={`Remove ${item.symbol}`}
                      >
                        {removing === item.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!items.length && (
                <p className="py-6 text-center text-sm text-mute">
                  The watchlist is empty. Add a symbol above.
                </p>
              )}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Create an alert">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
              <label className="text-[11px] text-mute">
                <span className="mb-1 block">Symbol</span>
                <Input
                  list="watch-symbols"
                  value={alertSymbol}
                  onChange={(e) => setAlertSymbol(e.target.value.toUpperCase())}
                  className="font-mono"
                  aria-label="Alert symbol"
                />
              </label>
              <label className="text-[11px] text-mute">
                <span className="mb-1 block">Condition</span>
                <Select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full"
                  aria-label="Alert condition"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={cn("text-[11px] text-mute sm:col-span-2", !requiresValue && "opacity-50")}>
                <span className="mb-1 block">
                  {requiresValue
                    ? ALERT_TYPES.find((t) => t.value === alertType)?.hint
                    : "No numeric threshold for forecast alerts"}
                </span>
                <Input
                  value={alertValue}
                  onChange={(e) => setAlertValue(e.target.value)}
                  disabled={!requiresValue}
                  inputMode="decimal"
                  placeholder={requiresValue ? "70000" : "not used"}
                  className="font-mono"
                  aria-label="Alert threshold"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={() => void createAlert()} disabled={creatingAlert}>
                {creatingAlert ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                Create alert
              </Button>
              <span className="text-[10px] leading-4 text-mute">
                Triggered alerts stay in the list with their message and timestamp.
              </span>
            </div>
          </Panel>

          <Panel
            title="Alert log"
            action={<Badge tone={triggered ? "warn" : "muted"}>{triggered} triggered</Badge>}
          >
            <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-2 rounded-lg px-3 py-2",
                    alert.triggered ? "bg-amber-400/5 ring-1 ring-amber-400/20" : "bg-secondary",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink">{alert.symbol}</span>
                      <Badge tone={alert.triggered ? "warn" : "muted"}>{alertLabel(alert.type)}</Badge>
                      {alert.value != null && (
                        <span className="font-mono text-[11px] text-mute">
                          {alert.type === "pct_move" ? `${alert.value}%` : formatPrice(alert.value)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-mute">
                      <span>created {timeAgo(alert.createdAt)}</span>
                      {alert.triggeredAt && (
                        <span className="flex items-center gap-1 text-amber-300">
                          <BellRing className="h-3 w-3" /> fired {timeAgo(alert.triggeredAt)}
                        </span>
                      )}
                    </div>
                    {alert.message && (
                      <p className="mt-1 text-[11px] leading-4 text-mute">{alert.message}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs text-bear"
                    disabled={removingAlert === alert.id}
                    onClick={() => void deleteAlert(alert)}
                    aria-label={`Delete ${alert.symbol} alert`}
                  >
                    {removingAlert === alert.id ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
              {!alerts.length && (
                <p className="py-6 text-center text-sm text-mute">
                  No alerts yet. Create a price threshold or forecast-direction alert above.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
