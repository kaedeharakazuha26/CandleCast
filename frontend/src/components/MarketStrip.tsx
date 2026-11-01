import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchTickers } from "../services/api";
import { useTickerStream } from "../hooks/useTickerStream";
import { useTerminal } from "../store/terminal";
import type { Ticker } from "../types/market";
import { formatPercent, formatPrice } from "../utils/format";
import { cn } from "../utils/cn";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

export function MarketStrip() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = useTerminal((s) => s.symbol);
  const setSymbol = useTerminal((s) => s.setSymbol);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [restAt, setRestAt] = useState<number | null>(null);
  const { tickers: liveTickers, updatedAt } = useTickerStream(SYMBOLS);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchTickers(SYMBOLS)
        .then((items) => {
          if (cancelled) return;
          setTickers(items);
          setRestAt(Date.now());
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 bg-secondary/40 px-3 py-1.5">
      <span className="mr-1 shrink-0 text-[10px] font-medium uppercase tracking-widest text-mute">Markets</span>
      {SYMBOLS.map((symbol) => {
        const restTicker = tickers.find((t) => t.symbol === symbol);
        const liveTicker = liveTickers[symbol];
        const liveFresh = liveTicker != null && (!restAt || (liveTicker.updatedAt ?? 0) >= restAt);
        const ticker = liveFresh ? liveTicker : restTicker ?? liveTicker;
        const up = (ticker?.change24h ?? 0) >= 0;
        return (
          <button
            key={symbol}
            onClick={() => {
              setSymbol(symbol);
              if (location.pathname !== "/" && location.pathname !== "/predict") navigate("/predict");
            }}
            className={cn(
              "flex shrink-0 items-baseline gap-1.5 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/5",
              active === symbol && "bg-white/5",
            )}
          >
            <span className="text-mute">{symbol.replace("USDT", "")}</span>
            <span className="font-mono text-ink">{ticker ? formatPrice(ticker.price) : "—"}</span>
            <span className={cn("font-mono", up ? "text-bull" : "text-bear")}>
              {ticker ? formatPercent(ticker.change24h) : ""}
            </span>
          </button>
        );
      })}
      <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-[10px] text-mute sm:flex">
        <span className={cn("h-1.5 w-1.5 rounded-full", updatedAt ? "bg-bull" : "bg-mute/50")} />
        Binance spot · {updatedAt ? "streaming" : "public data"}
      </span>
    </div>
  );
}
