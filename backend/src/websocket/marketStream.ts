import WebSocket from "ws";
import type { Server } from "socket.io";
import { config, TIMEFRAMES, type Timeframe } from "../config.js";

type Stream = {
  ws: WebSocket;
  refs: number;
  reconnectTimer?: NodeJS.Timeout;
};

const upstream = new Map<string, Stream>();

const TICKER_ROOM = "market-tickers";
const tickerRefs = new Map<string, number>();
let tickerWs: WebSocket | null = null;
let tickerSymbols: string[] = [];
let tickerReconnectTimer: NodeJS.Timeout | undefined;
let tickerSyncTimer: NodeJS.Timeout | undefined;

function streamKey(symbol: string, timeframe: Timeframe) {
  return `${symbol.toLowerCase()}@kline_${TIMEFRAMES[timeframe].binance}`;
}

function room(symbol: string, timeframe: Timeframe) {
  return `${symbol}:${timeframe}`;
}

export function attachMarketStream(io: Server) {
  io.on("connection", (socket) => {
    let currentRoom: string | null = null;
    const localTickerRefs = new Map<string, number>();
    let inTickerRoom = false;

    const addTickerSymbol = (symbol: string) => {
      localTickerRefs.set(symbol, (localTickerRefs.get(symbol) ?? 0) + 1);
      tickerRefs.set(symbol, (tickerRefs.get(symbol) ?? 0) + 1);
    };

    const removeTickerSymbol = (symbol: string) => {
      const local = (localTickerRefs.get(symbol) ?? 0) - 1;
      if (local > 0) localTickerRefs.set(symbol, local);
      else localTickerRefs.delete(symbol);

      const global = (tickerRefs.get(symbol) ?? 0) - 1;
      if (global > 0) tickerRefs.set(symbol, global);
      else tickerRefs.delete(symbol);
    };

    socket.emit("connection_status", { state: "connected" });

    socket.on("subscribe", (payload: { symbol?: string; timeframe?: Timeframe }) => {
      const symbol = String(payload.symbol ?? "BTCUSDT").toUpperCase();
      const timeframe = (payload.timeframe ?? "1h") as Timeframe;
      if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !(timeframe in TIMEFRAMES)) return;
      const nextRoom = room(symbol, timeframe);
      if (currentRoom === nextRoom) return;
      if (currentRoom) {
        void socket.leave(currentRoom);
        releaseUpstream(currentRoom);
      }
      currentRoom = nextRoom;
      void socket.join(nextRoom);
      acquireUpstream(io, symbol, timeframe);
    });

    socket.on("subscribe_tickers", (payload: { symbols?: unknown }) => {
      const symbols = normalizeTickerSymbols(payload?.symbols);
      if (!symbols.length) return;
      for (const symbol of symbols) addTickerSymbol(symbol);
      if (!inTickerRoom) {
        void socket.join(TICKER_ROOM);
        inTickerRoom = true;
      }
      scheduleTickerSync(io);
    });

    socket.on("unsubscribe_tickers", (payload: { symbols?: unknown }) => {
      const symbols = normalizeTickerSymbols(payload?.symbols);
      if (!symbols.length) return;
      for (const symbol of symbols) removeTickerSymbol(symbol);
      if (!localTickerRefs.size && inTickerRoom) {
        void socket.leave(TICKER_ROOM);
        inTickerRoom = false;
      }
      scheduleTickerSync(io);
    });

    socket.on("disconnect", () => {
      if (currentRoom) releaseUpstream(currentRoom);
      currentRoom = null;
      for (const [symbol, count] of localTickerRefs) {
        const remaining = (tickerRefs.get(symbol) ?? 0) - count;
        if (remaining > 0) tickerRefs.set(symbol, remaining);
        else tickerRefs.delete(symbol);
      }
      localTickerRefs.clear();
      scheduleTickerSync(io);
    });
  });
}

function normalizeTickerSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    const symbol = String(item ?? "").toUpperCase();
    if (/^[A-Z0-9]{5,20}$/.test(symbol)) seen.add(symbol);
    if (seen.size >= 80) break;
  }
  return [...seen];
}

function scheduleTickerSync(io: Server) {
  if (tickerSyncTimer) return;
  tickerSyncTimer = setTimeout(() => {
    tickerSyncTimer = undefined;
    syncTickerStream(io);
  }, 150);
}

function syncTickerStream(io: Server) {
  const symbols = [...tickerRefs.keys()].sort();
  if (!symbols.length) {
    closeTickerStream();
    return;
  }
  if (
    tickerWs &&
    tickerSymbols.join("|") === symbols.join("|") &&
    (tickerWs.readyState === WebSocket.OPEN || tickerWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  openTickerStream(io, symbols);
}

type MiniTicker = {
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
};

function openTickerStream(io: Server, symbols: string[]) {
  closeTickerStream();
  tickerSymbols = symbols;

  const base = config.binanceWs.replace(/\/ws\/?$/, "");
  const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@miniTicker`).join("/");
  const ws = new WebSocket(`${base}/stream?streams=${streams}`);
  tickerWs = ws;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as MiniTicker & { data?: MiniTicker };
      const data = msg.data ?? msg;
      if (!data.s || !tickerRefs.has(data.s.toUpperCase())) return;

      const price = Number(data.c);
      const open = Number(data.o);
      if (!Number.isFinite(price) || price <= 0) return;

      io.to(TICKER_ROOM).emit("ticker", {
        symbol: data.s.toUpperCase(),
        price,
        change24h: open > 0 ? ((price - open) / open) * 100 : 0,
        high24h: Number(data.h),
        low24h: Number(data.l),
        volume24h: Number(data.v),
        quoteVolume24h: Number(data.q),
        updatedAt: Date.now(),
      });
    } catch {
      // Ignore malformed exchange frames.
    }
  });

  ws.on("close", () => {
    if (tickerWs !== ws) return;
    tickerWs = null;
    tickerSymbols = [];
    if (!tickerRefs.size) return;
    tickerReconnectTimer = setTimeout(() => {
      if (tickerRefs.size) openTickerStream(io, [...tickerRefs.keys()].sort());
    }, 3000);
  });

  ws.on("error", (error) => {
    console.error("[ticker] stream error", error.message);
    try {
      ws.close();
    } catch {
      // Ignore.
    }
  });
}

function closeTickerStream() {
  if (tickerReconnectTimer) {
    clearTimeout(tickerReconnectTimer);
    tickerReconnectTimer = undefined;
  }
  const ws = tickerWs;
  tickerWs = null;
  tickerSymbols = [];
  if (!ws) return;
  try {
    ws.close();
  } catch {
    // Already closed.
  }
}

function acquireUpstream(io: Server, symbol: string, timeframe: Timeframe) {
  const key = streamKey(symbol, timeframe);
  const existing = upstream.get(key);
  if (existing) {
    existing.refs += 1;
    if (existing.ws.readyState === WebSocket.OPEN || existing.ws.readyState === WebSocket.CONNECTING) return;
    if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
    open(io, key, symbol, timeframe, existing);
    return;
  }
  const stream: Stream = { ws: undefined as unknown as WebSocket, refs: 1 };
  upstream.set(key, stream);
  open(io, key, symbol, timeframe, stream);
}

function releaseUpstream(roomKey: string) {
  const [symbol, timeframe] = roomKey.split(":") as [string, Timeframe];
  const key = streamKey(symbol, timeframe);
  const stream = upstream.get(key);
  if (!stream) return;
  stream.refs = Math.max(0, stream.refs - 1);
  if (stream.refs > 0) return;
  if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
  upstream.delete(key);
  try {
    stream.ws.close();
  } catch {
    // Already closed.
  }
}

function open(io: Server, key: string, symbol: string, timeframe: Timeframe, stream: Stream) {
  const ws = new WebSocket(`${config.binanceWs}/${key}`);
  stream.ws = ws;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        k: {
          t: number;
          o: string;
          h: string;
          l: string;
          c: string;
          v: string;
          q: string;
          x: boolean;
        };
      };
      io.to(room(symbol, timeframe)).emit("kline", {
        symbol,
        timeframe,
        closed: msg.k.x,
        candle: {
          timestamp: msg.k.t,
          open: Number(msg.k.o),
          high: Number(msg.k.h),
          low: Number(msg.k.l),
          close: Number(msg.k.c),
          volume: Number(msg.k.v),
          amount: Number(msg.k.q),
        },
      });
    } catch {
      // Ignore malformed exchange frames.
    }
  });

  ws.on("close", () => {
    if (stream.refs <= 0 || upstream.get(key) !== stream) return;
    stream.reconnectTimer = setTimeout(() => {
      if (stream.refs > 0 && upstream.get(key) === stream) open(io, key, symbol, timeframe, stream);
    }, 3000);
  });

  ws.on("error", (error) => {
    console.error(`[stream] ${key} error`, error.message);
    try {
      ws.close();
    } catch {
      // Ignore.
    }
  });
}
