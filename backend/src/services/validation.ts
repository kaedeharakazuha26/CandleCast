import type { Candle } from "../utils/types.js";

/**
 * Independent guard on the Node side. Kronos inference already validates and
 * logs repairs; this makes sure a malformed AI response never reaches the chart
 * or the database.
 */
export function assertForecastCandles(
  candles: Candle[],
  timeframeMs: number,
  lastContextTimestamp: number,
): void {
  if (!candles.length) throw new Error("Forecast contains no candles");
  let previousTimestamp: number | null = null;
  for (const [index, c] of candles.entries()) {
    const label = `Forecast candle ${index}`;
    if (![c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)) {
      throw new Error(`${label} contains non-finite values`);
    }
    if (c.high < Math.max(c.open, c.close)) {
      throw new Error(`${label} has high below open/close`);
    }
    if (c.low > Math.min(c.open, c.close)) {
      throw new Error(`${label} has low above open/close`);
    }
    if (c.high < c.low) throw new Error(`${label} has high below low`);
    if (c.volume < 0) throw new Error(`${label} has negative volume`);
    if (previousTimestamp == null) {
      if (c.timestamp <= lastContextTimestamp) {
        throw new Error(`${label} overlaps the inference context`);
      }
    } else if (c.timestamp - previousTimestamp !== timeframeMs) {
      throw new Error(`${label} is not spaced by the selected timeframe`);
    }
    previousTimestamp = c.timestamp;
  }
}
