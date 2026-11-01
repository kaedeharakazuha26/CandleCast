import { useEffect } from "react";
import { fetchKlines, fetchTicker } from "../services/api";
import { getSocket } from "../services/realtime";
import { useTickerStream } from "./useTickerStream";
import { useTerminal } from "../store/terminal";
import type { Candle } from "../types/market";

export function useMarket() {
  const symbol = useTerminal((s) => s.symbol);
  const timeframe = useTerminal((s) => s.timeframe);
  const setCandles = useTerminal((s) => s.setCandles);
  const setTicker = useTerminal((s) => s.setTicker);
  const setLoadingMarket = useTerminal((s) => s.setLoadingMarket);
  const setError = useTerminal((s) => s.setError);
  const upsertLiveCandle = useTerminal((s) => s.upsertLiveCandle);
  const setLive = useTerminal((s) => s.setLive);
  const { tickers: streamedTickers } = useTickerStream([symbol]);

  useEffect(() => {
    const streamed = streamedTickers[symbol];
    if (streamed) setTicker(streamed);
  }, [streamedTickers, symbol, setTicker]);

  useEffect(() => {
    let cancelled = false;
    setLoadingMarket(true);
    Promise.all([fetchKlines(symbol, timeframe, 500), fetchTicker(symbol)])
      .then(([candles, ticker]) => {
        if (cancelled) return;
        setCandles(candles);
        setTicker(ticker);
        setError(null);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(err.message ?? "Failed to load market data");
      })
      .finally(() => {
        if (!cancelled) setLoadingMarket(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, setCandles, setTicker, setLoadingMarket, setError]);

  useEffect(() => {
    const socket = getSocket();
    const subscribe = () => socket.emit("subscribe", { symbol, timeframe });
    const onConnect = () => {
      setLive(true);
      subscribe();
    };
    const onDisconnect = () => setLive(false);
    const onKline = (payload: { candle: Candle; symbol: string; timeframe: string }) => {
      if (payload.symbol !== symbol || payload.timeframe !== timeframe) return;
      upsertLiveCandle(payload.candle);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("kline", onKline);
    if (socket.connected) onConnect();
    else subscribe();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("kline", onKline);
    };
  }, [symbol, timeframe, upsertLiveCandle, setLive]);

  // Refresh the 24h ticker periodically; the kline socket keeps the price live.
  useEffect(() => {
    const timer = setInterval(() => {
      fetchTicker(symbol).then(setTicker).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [symbol, setTicker]);
}
