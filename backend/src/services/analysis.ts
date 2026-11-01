import type { IndicatorSeries } from "./indicators.js";
import type { Candle } from "../utils/types.js";

export type Direction = "Bullish" | "Bearish" | "Sideways";
export type Signal = "Strong Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strong Bearish";

export type UncertaintyInput = {
  sampleCloseStd?: number[] | null;
  uncertaintySamples?: number;
};

export function summarizePrediction(
  context: Candle[],
  predicted: Candle[],
  indicators: IndicatorSeries,
  uncertainty: UncertaintyInput = {},
) {
  if (!predicted.length || !context.length) {
    throw new Error("Prediction and context candles are required");
  }
  const lastClose = context[context.length - 1].close;
  const first = predicted[0];
  const last = predicted[predicted.length - 1];
  const closes = predicted.map((c) => c.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const minLow = Math.min(...predicted.map((c) => c.low));
  const maxHigh = Math.max(...predicted.map((c) => c.high));
  const pct = ((last.close - lastClose) / lastClose) * 100;
  const ups = predicted.filter((c) => c.close >= c.open).length;
  const downs = predicted.length - ups;
  const rangePct = ((maxClose - minClose) / lastClose) * 100;
  const lastVolume = last.volume;

  let marketDirection: Direction = "Sideways";
  if (pct > 0.35 && ups > downs) marketDirection = "Bullish";
  else if (pct < -0.35 && downs > ups) marketDirection = "Bearish";
  else if (Math.abs(pct) < 0.2 && rangePct < 0.8) marketDirection = "Sideways";
  else if (pct > 0) marketDirection = "Bullish";
  else if (pct < 0) marketDirection = "Bearish";

  const shortTerm = predicted.length >= 3
    ? directionFrom(lastClose, predicted[Math.min(2, predicted.length - 1)].close)
    : directionFrom(lastClose, last.close);
  const mediumTerm = directionFrom(lastClose, last.close);

  const latest = indicators.latest;
  const momentum =
    latest.rsi != null && latest.rsi >= 60 ? "Elevated" : latest.rsi != null && latest.rsi <= 40 ? "Soft" : "Balanced";
  const volatility =
    latest.atr != null ? `${((latest.atr / lastClose) * 100).toFixed(2)}% ATR/price` : "Unavailable";

  const supporting: string[] = [];
  if (latest.ema9 != null && latest.ema20 != null) {
    supporting.push(latest.ema9 >= latest.ema20 ? "EMA9 above EMA20" : "EMA9 below EMA20");
  }
  if (latest.rsi != null) supporting.push(`RSI ${latest.rsi.toFixed(1)}`);
  if (latest.macd != null && latest.macdSignal != null) {
    supporting.push(latest.macd >= latest.macdSignal ? "MACD above signal" : "MACD below signal");
  }
  if (latest.bbUpper != null && latest.bbLower != null && latest.bbMid != null) {
    if (lastClose >= latest.bbUpper) supporting.push("Close at/above upper Bollinger band");
    else if (lastClose <= latest.bbLower) supporting.push("Close at/below lower Bollinger band");
    else supporting.push(`Close ${lastClose >= latest.bbMid ? "above" : "below"} Bollinger mid-band`);
  }
  if (latest.vwap != null) {
    supporting.push(lastClose >= latest.vwap ? "Close above VWAP" : "Close below VWAP");
  }
  if (latest.stochRsi != null) {
    supporting.push(`Stoch RSI ${(latest.stochRsi * 100).toFixed(1)}`);
  }
  if (lastVolume > 0) {
    supporting.push(last.volume >= first.volume ? "Predicted volume expanding" : "Predicted volume contracting");
  }

  let signal: Signal = "Neutral";
  let score = 0;
  if (marketDirection === "Bullish") score += 1;
  if (marketDirection === "Bearish") score -= 1;
  if (latest.ema9 != null && latest.ema20 != null) score += latest.ema9 >= latest.ema20 ? 1 : -1;
  if (latest.rsi != null) {
    if (latest.rsi >= 60) score += 1;
    if (latest.rsi <= 40) score -= 1;
  }
  if (pct > 1) score += 1;
  if (pct < -1) score -= 1;
  if (score >= 3) signal = "Strong Bullish";
  else if (score === 2) signal = "Bullish";
  else if (score <= -3) signal = "Strong Bearish";
  else if (score === -2) signal = "Bearish";

  const risk = Math.abs(pct) > 2 || rangePct > 3 ? "Elevated" : Math.abs(pct) > 0.8 ? "Moderate" : "Contained";

  const stds = uncertainty.sampleCloseStd ?? [];
  const finalStd = stds.length ? stds[stds.length - 1] : null;
  const uncertaintyBlock = {
    source: finalStd != null ? ("independent-passes" as const) : ("path-dispersion" as const),
    passes: uncertainty.uncertaintySamples ?? 0,
    closeStdFinal: finalStd,
    closeBand:
      finalStd != null
        ? { lower: last.close - finalStd, upper: last.close + finalStd }
        : { lower: minLow, upper: maxHigh },
    note:
      finalStd != null
        ? `Standard deviation of the final close across ${uncertainty.uncertaintySamples ?? stds.length} independent Kronos passes. Not a calibrated confidence interval.`
        : "Single-pass Kronos sample. The band is the predicted high/low envelope, not a statistical confidence interval.",
  };

  const explanation =
    `The model forecasts a ${marketDirection.toLowerCase()} path over the next ${predicted.length} candle(s). ` +
    `Predicted closes move ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% from the last traded close, ` +
    `with an intra-horizon close range of ${rangePct.toFixed(2)}%. ` +
    `${supporting.join(". ")}. ` +
    `${uncertaintyBlock.note} ` +
    `This is a Kronos sample path, not a probability of profit.`;

  return {
    marketDirection,
    predictedPrice: {
      nextClose: first.close,
      lastHorizonClose: last.close,
      range: { min: minClose, max: maxClose, low: minLow, high: maxHigh },
      percentMove: pct,
    },
    candleAnalysis: first,
    sequence: predicted,
    trend: { shortTerm, mediumTerm, momentum, volatility },
    signal: {
      direction: signal,
      supporting: supporting,
      predictedPercent: pct,
      risk,
      timestamp: Date.now(),
    },
    uncertainty: uncertaintyBlock,
    explanation,
    disclaimer:
      "Outputs are Kronos-base samples plus technical context. They are not trading advice and are not calibrated probabilities.",
  };
}

function directionFrom(start: number, end: number): Direction {
  const pct = ((end - start) / start) * 100;
  if (pct > 0.25) return "Bullish";
  if (pct < -0.25) return "Bearish";
  return "Sideways";
}
