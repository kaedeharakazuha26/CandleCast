import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../services/realtime";
import type { Ticker } from "../types/market";

/**
 * Subscribes to Binance miniTicker frames for the requested symbols.
 * Frames are batched to keep page renders cheap while staying effectively live.
 */
export function useTickerStream(symbols: string[]) {
  const key = useMemo(
    () =>
      [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].sort().join(","),
    [symbols],
  );
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!key) return;
    const wanted = new Set(key.split(","));
    const socket = getSocket();
    const buffer = new Map<string, Ticker>();

    const onTicker = (ticker: Ticker) => {
      if (wanted.has(ticker.symbol)) buffer.set(ticker.symbol, { ...ticker, updatedAt: Date.now() });
    };
    const subscribe = () => socket.emit("subscribe_tickers", { symbols: [...wanted] });

    const flush = setInterval(() => {
      if (!buffer.size) return;
      const next = Object.fromEntries(buffer);
      buffer.clear();
      setTickers((current) => ({ ...current, ...next }));
      setUpdatedAt(Date.now());
    }, 250);

    socket.on("ticker", onTicker);
    socket.on("connect", subscribe);
    if (socket.connected) subscribe();

    return () => {
      clearInterval(flush);
      if (socket.connected) socket.emit("unsubscribe_tickers", { symbols: [...wanted] });
      socket.off("ticker", onTicker);
      socket.off("connect", subscribe);
    };
  }, [key]);

  return { tickers, updatedAt };
}
