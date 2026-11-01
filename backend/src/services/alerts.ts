import type { Server } from "socket.io";
import { prisma } from "../database/prisma.js";
import { getTicker } from "./binance.js";

type AlertRow = {
  id: string;
  symbol: string;
  type: string;
  value: number | null;
};

let ioRef: Server | null = null;

export function bindAlertSocket(io: Server) {
  ioRef = io;
}

function formatValue(value: number | null) {
  return value == null ? "" : ` ${value}`;
}

async function markTriggered(alert: AlertRow, message: string) {
  const result = await prisma.priceAlert.updateMany({
    where: { id: alert.id, triggered: false },
    data: { triggered: true, triggeredAt: new Date(), message },
  });
  if (!result.count) return;
  ioRef?.emit("alert", {
    id: alert.id,
    symbol: alert.symbol,
    type: alert.type,
    message,
    triggeredAt: new Date().toISOString(),
  });
  console.log(`[alert] ${message}`);
}

async function evaluatePriceAlerts() {
  try {
    const alerts = await prisma.priceAlert.findMany({
      where: {
        triggered: false,
        type: { in: ["price_above", "price_below", "pct_move"] },
      },
    });
    if (!alerts.length) return;

    const symbols = [...new Set(alerts.map((a) => a.symbol))];
    const tickers = new Map<string, Awaited<ReturnType<typeof getTicker>>>();
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          tickers.set(symbol, await getTicker(symbol));
        } catch {
          // A delisted or temporarily unavailable symbol must not stop other alerts.
        }
      }),
    );

    for (const alert of alerts) {
      const ticker = tickers.get(alert.symbol);
      if (!ticker || alert.value == null) continue;
      if (alert.type === "price_above" && ticker.price >= alert.value) {
        await markTriggered(alert, `${alert.symbol} price ${ticker.price} is above ${alert.value}`);
      } else if (alert.type === "price_below" && ticker.price <= alert.value) {
        await markTriggered(alert, `${alert.symbol} price ${ticker.price} is below ${alert.value}`);
      } else if (alert.type === "pct_move" && Math.abs(ticker.change24h) >= alert.value) {
        await markTriggered(
          alert,
          `${alert.symbol} 24h move ${ticker.change24h.toFixed(2)}% reached the ${alert.value}% threshold`,
        );
      }
    }
  } catch (error) {
    console.error("[alert] price monitor failed", error);
  }
}

export function startAlertMonitor(io: Server) {
  bindAlertSocket(io);
  void evaluatePriceAlerts();
  const timer = setInterval(() => void evaluatePriceAlerts(), 30_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Called after a forecast is stored, so prediction alerts fire exactly once. */
export async function triggerPredictionAlerts(
  symbol: string,
  direction: string | null,
  explanation: string,
) {
  if (!direction) return;
  const wanted =
    direction === "Bullish"
      ? "bullish_prediction"
      : direction === "Bearish"
        ? "bearish_prediction"
        : null;
  if (!wanted) return;
  const alerts = await prisma.priceAlert.findMany({
    where: { symbol, type: wanted, triggered: false },
  });
  for (const alert of alerts) {
    await markTriggered(
      alert,
      `${symbol} Kronos forecast is ${direction.toLowerCase()}${formatValue(alert.value)}. ${explanation}`,
    );
  }
}
