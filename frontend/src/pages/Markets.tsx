import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BarChart3, Flame, Plus, RefreshCw, Search, Star, TrendingDown, TrendingUp } from "lucide-react";
import { Panel, Stat } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { addWatchlist, fetchAllTickers, fetchSymbols, fetchTickers } from "../services/api";
import { useTickerStream } from "../hooks/useTickerStream";
import { useTerminal } from "../store/terminal";
import type { Ticker } from "../types/market";
import { formatClock, formatCompact, formatPercent, formatPrice } from "../utils/format";
import { cn } from "../utils/cn";

const PAGE_SIZE = 24;
const COMMON = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

const MOVER_TABS = [
  { id: "gainers", label: "Gainers", icon: TrendingUp },
  { id: "losers", label: "Losers", icon: TrendingDown },
  { id: "active", label: "Most active", icon: Flame },
] as const;

type MoverTab = (typeof MOVER_TABS)[number]["id"];

/** Ignore thin pairs so the ranking reflects markets people actually trade. */
const MOVER_MIN_QUOTE_VOLUME = 1_000_000;
const MOVER_COUNT = 8;

export function Markets() {
  const navigate = useNavigate();
  const storeSymbol = useTerminal((s) => s.symbol);
  const setSymbol = useTerminal((s) => s.setSymbol);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [loadingSymbols, setLoadingSymbols] = useState(true);
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [restUpdatedAt, setRestUpdatedAt] = useState<number | null>(null);
  const [movers, setMovers] = useState<Ticker[]>([]);
  const [moverTab, setMoverTab] = useState<MoverTab>("gainers");
  const [moversAt, setMoversAt] = useState<number | null>(null);
  const [moversError, setMoversError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSymbols(true);
    fetchSymbols()
      .then((list) => {
        if (!cancelled) {
          setSymbols(list);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Binance symbol list is unavailable. Check backend connectivity.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSymbols(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return symbols;
    return symbols.filter((symbol) => symbol.includes(q));
  }, [symbols, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageSymbols = useMemo(
    () => filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [filtered, currentPage],
  );
  const pageKey = pageSymbols.join(",");
  const { tickers: liveTickers, updatedAt: liveUpdatedAt } = useTickerStream(pageSymbols);
  const asOf = Math.max(liveUpdatedAt ?? 0, restUpdatedAt ?? 0) || null;
  const streamActive = liveUpdatedAt != null && liveUpdatedAt >= (restUpdatedAt ?? 0) - 5_000;

  const ranked = useMemo(() => {
    const liquid = movers.filter(
      (t) => Number.isFinite(t.change24h) && t.quoteVolume24h >= MOVER_MIN_QUOTE_VOLUME,
    );
    if (moverTab === "active") {
      return [...liquid].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h).slice(0, MOVER_COUNT);
    }
    const direction = moverTab === "gainers" ? 1 : -1;
    return [...liquid].sort((a, b) => direction * (b.change24h - a.change24h)).slice(0, MOVER_COUNT);
  }, [movers, moverTab]);

  const moverSymbols = useMemo(() => ranked.map((t) => t.symbol), [ranked]);
  const { tickers: liveMovers } = useTickerStream(moverSymbols);
  const moverRows = ranked.map((t) => liveMovers[t.symbol] ?? t);

  useEffect(() => {
    setPage(0);
  }, [query]);

  useEffect(() => {
    if (!pageSymbols.length) {
      setLoadingTickers(false);
      return;
    }
    let cancelled = false;
    let firstLoad = true;
    if (firstLoad) setLoadingTickers(true);

    const load = () =>
      fetchTickers(pageSymbols)
        .then((items) => {
          if (cancelled) return;
          setTickers((prev) => {
            const next = { ...prev };
            for (const ticker of items) next[ticker.symbol] = ticker;
            return next;
          });
          setRestUpdatedAt(Date.now());
        })
        .catch(() => {
          if (!cancelled) setError("24h tickers could not be loaded for this page.");
        })
        .finally(() => {
          if (cancelled) return;
          if (firstLoad) {
            firstLoad = false;
            setLoadingTickers(false);
          }
        });

    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // pageKey identifies the visible symbol set.
  }, [pageKey]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchAllTickers()
        .then((items) => {
          if (cancelled) return;
          setMovers(items);
          setMoversAt(Date.now());
          setMoversError(null);
        })
        .catch(() => {
          if (!cancelled) setMoversError("Market rankings are unavailable. The full pair list still works.");
        });
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function watch(symbol: string) {
    setAdding(symbol);
    setNotice(null);
    try {
      await addWatchlist(symbol);
      setNotice(`${symbol} added to the watchlist.`);
    } catch {
      setNotice(`Could not add ${symbol} to the watchlist.`);
    } finally {
      setAdding(null);
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
              <BarChart3 className="h-4 w-4 text-accent" />
              Binance spot markets
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-mute">
              Every USDT pair listed by Binance is searchable here. Prices stream from Binance miniTicker frames with a
              20-second REST fallback; selecting a pair loads it in the forecast terminal. No synthetic market data is
              generated.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-5">
            <Stat label="Pairs" value={loadingSymbols ? "…" : symbols.length} hint="USDT spot" />
            <Stat label="Page" value={`${currentPage + 1} / ${pageCount}`} hint={`${PAGE_SIZE} per page`} />
            <Stat
              label="Quote"
              value="USDT"
              hint={loadingTickers ? "loading tickers…" : "24h ticker data"}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Top movers"
        action={
          <div className="flex items-center gap-1">
            {MOVER_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMoverTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition",
                    moverTab === tab.id
                      ? "border-accent/40 bg-accent/15 text-accent"
                      : "border-white/5 bg-secondary/40 text-mute hover:text-ink",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        }
      >
        {moversError ? (
          <p className="text-xs text-bear">{moversError}</p>
        ) : !moverRows.length ? (
          <p className="text-xs text-mute">Ranking Binance USDT pairs…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {moverRows.map((t) => {
                const up = t.change24h >= 0;
                return (
                  <button
                    key={t.symbol}
                    onClick={() => openTerminal(t.symbol)}
                    className="rounded-lg border border-white/5 bg-secondary/40 px-3 py-2 text-left transition hover:border-accent/40 hover:bg-accent/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink">{t.symbol.replace(/USDT$/, "")}</span>
                      <span className={cn("font-mono text-[11px]", up ? "text-bull" : "text-bear")}>
                        {formatPercent(t.change24h)}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-sm text-ink">{formatPrice(t.price)}</div>
                    <div className="mt-0.5 text-[10px] text-mute">{formatCompact(t.quoteVolume24h)} USDT vol</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-mute">
              Ranked across {movers.length} tradable USDT pairs from one cached Binance snapshot
              {moversAt ? ` at ${formatClock(moversAt)}` : ""}. Pairs below {formatCompact(MOVER_MIN_QUOTE_VOLUME)} USDT of
              24h quote volume are excluded. Prices update from the live ticker stream; click a card to open it in the
              terminal.
            </p>
          </>
        )}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              placeholder="Search BTC, ETH, SOL…"
              className="pl-9 font-mono"
              aria-label="Search trading pairs"
            />
          </div>
          <Button variant="outline" onClick={() => setQuery("")} disabled={!query}>
            Clear
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-[11px] text-mute">
            {filtered.length} match{filtered.length === 1 ? "" : "es"}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-mute">
            <span className={cn("h-1.5 w-1.5 rounded-full", streamActive ? "bg-bull" : "bg-amber-400")} />
            {streamActive ? "streaming" : "polling"} · as of {formatClock(asOf)}
          </span>
        </div>

        {(error || notice) && (
          <div className="mt-3 space-y-1">
            {error && <p className="text-xs text-bear">{error}</p>}
            {notice && <p className="text-xs text-bull">{notice}</p>}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-[9px] uppercase tracking-widest text-mute">
              <tr>
                <th className="pb-2 text-left font-medium">Pair</th>
                <th className="pb-2 text-right font-medium">Last price</th>
                <th className="pb-2 text-right font-medium">24h</th>
                <th className="pb-2 text-right font-medium">24h low / high</th>
                <th className="pb-2 text-right font-medium">24h volume</th>
                <th className="pb-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageSymbols.map((symbol) => {
                const restTicker = tickers[symbol];
                const liveTicker = liveTickers[symbol];
                const liveFresh =
                  liveTicker != null && (!restUpdatedAt || (liveTicker.updatedAt ?? 0) >= restUpdatedAt);
                const ticker = liveFresh ? liveTicker : restTicker ?? liveTicker;
                const up = (ticker?.change24h ?? 0) >= 0;
                return (
                  <tr
                    key={symbol}
                    className={cn(
                      "cursor-pointer border-t border-white/5 transition hover:bg-white/5",
                      symbol === storeSymbol && "bg-accent/5",
                    )}
                    onClick={() => openTerminal(symbol)}
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2 font-mono text-xs text-ink">
                        {COMMON.includes(symbol) && <Star className="h-3 w-3 text-amber-300" />}
                        {symbol}
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {ticker ? formatPrice(ticker.price) : loadingTickers ? "…" : "—"}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right font-mono text-xs",
                        ticker ? (up ? "text-bull" : "text-bear") : "text-mute",
                      )}
                    >
                      {ticker ? formatPercent(ticker.change24h) : "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-[11px] text-mute">
                      {ticker ? `${formatPrice(ticker.low24h)} – ${formatPrice(ticker.high24h)}` : "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-[11px] text-mute">
                      {ticker ? formatCompact(ticker.volume24h) : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          disabled={adding === symbol}
                          onClick={(e) => {
                            e.stopPropagation();
                            void watch(symbol);
                          }}
                          title="Add to watchlist"
                        >
                          {adding === symbol ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Watch
                        </Button>
                        <Button
                          variant="outline"
                          className="px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTerminal(symbol);
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!pageSymbols.length && !loadingSymbols && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-mute">
            <Search className="h-5 w-5" />
            No Binance USDT pair matches “{query}”.
          </div>
        )}
        {loadingSymbols && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-mute">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading Binance exchange info…
          </div>
        )}
      </Panel>

      <p className="px-1 text-[11px] leading-5 text-mute">
        The star marks the six default majors pinned by the backend. Visible pairs stream from Binance miniTicker with a
        20-second REST fallback to respect rate limits. Prices are spot, not futures, and may differ from the venue you
        trade on.
      </p>
    </div>
  );
}
