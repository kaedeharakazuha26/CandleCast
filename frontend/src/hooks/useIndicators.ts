import { useEffect } from "react";
import { fetchIndicators } from "../services/api";
import { useTerminal } from "../store/terminal";

export function useIndicators() {
  const symbol = useTerminal((s) => s.symbol);
  const timeframe = useTerminal((s) => s.timeframe);
  const setIndicatorSeries = useTerminal((s) => s.setIndicatorSeries);

  useEffect(() => {
    let cancelled = false;
    fetchIndicators(symbol, timeframe, 500)
      .then((series) => {
        if (!cancelled) setIndicatorSeries(series);
      })
      .catch(() => {
        if (!cancelled) setIndicatorSeries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, setIndicatorSeries]);
}
