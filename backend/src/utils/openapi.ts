const symbolParam = {
  name: "symbol",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Binance spot symbol, for example BTCUSDT",
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Stored prediction or backtest UUID",
};

const timeframeParam = {
  name: "timeframe",
  in: "query",
  required: false,
  schema: {
    type: "string",
    enum: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
    default: "1h",
  },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CandleCast Crypto Prediction API",
    version: "1.1.0",
    description:
      "CandleCast gateway for Binance market data, PostgreSQL prediction history, alerts, walk-forward backtests, and the Python Kronos-base inference service. Forecasts are sampled model paths, not calibrated probabilities or trading advice.",
  },
  tags: [
    { name: "Market", description: "Binance public market data and indicators" },
    { name: "Predictions", description: "Kronos forecasts, accuracy, replay and exports" },
    { name: "Backtesting", description: "Walk-forward evaluation without look-ahead" },
    { name: "Watchlist", description: "Symbols and price/forecast alerts" },
    { name: "System", description: "Model and service status" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Gateway liveness",
        responses: { "200": { description: "Gateway is running" } },
      },
    },
    "/api/market/symbols": {
      get: {
        tags: ["Market"],
        summary: "List tradable USDT spot pairs",
        responses: { "200": { description: "{ symbols: string[] }" } },
      },
    },
    "/api/market/tickers": {
      get: {
        tags: ["Market"],
        summary: "Batch 24h tickers",
        parameters: [
          {
            name: "symbols",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Comma separated list, maximum 24 symbols",
          },
        ],
        responses: { "200": { description: "{ items: Ticker[] }" } },
      },
    },
    "/api/market/tickers/all": {
      get: {
        tags: ["Market"],
        summary: "All USDT tickers for market-wide rankings",
        description:
          "One cached call covering every tradable USDT pair, sorted by 24h quote volume. No pagination.",
        responses: { "200": { description: "{ items: Ticker[] }" } },
      },
    },
    "/api/market/ticker/{symbol}": {
      get: {
        tags: ["Market"],
        summary: "Single 24h ticker",
        parameters: [symbolParam],
        responses: { "200": { description: "Ticker with price, change, high/low and volume" } },
      },
    },
    "/api/market/klines/{symbol}": {
      get: {
        tags: ["Market"],
        summary: "Historical OHLCV candles",
        parameters: [
          symbolParam,
          timeframeParam,
          { name: "limit", in: "query", schema: { type: "integer", minimum: 50, maximum: 1500, default: 500 } },
          { name: "startTime", in: "query", schema: { type: "integer" }, description: "Unix ms (range mode)" },
          { name: "endTime", in: "query", schema: { type: "integer" }, description: "Unix ms (range mode)" },
        ],
        responses: { "200": { description: "{ symbol, timeframe, candles }" } },
      },
    },
    "/api/indicators/{symbol}": {
      get: {
        tags: ["Market"],
        summary: "RSI, MACD, EMAs, SMA, Bollinger, ATR, VWAP and StochRSI",
        parameters: [symbolParam, timeframeParam],
        responses: { "200": { description: "{ indicators: IndicatorSeries }" } },
      },
    },
    "/api/predictions/generate": {
      post: {
        tags: ["Predictions"],
        summary: "Run Kronos-base forecast",
        description:
          "Runs the official Kronos predictor on closed Binance candles. Set uncertainty_samples for extra independent passes that report dispersion, and scenarios for independent 5/20/50 candle runs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["symbol", "timeframe", "horizon"],
                properties: {
                  symbol: { type: "string", example: "BTCUSDT" },
                  timeframe: {
                    type: "string",
                    enum: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
                  },
                  horizon: { type: "integer", enum: [1, 3, 5, 10, 20, 50] },
                  lookback: { type: "integer", minimum: 32, maximum: 512 },
                  temperature: { type: "number", minimum: 0.1, maximum: 2 },
                  top_p: { type: "number", minimum: 0.1, maximum: 1 },
                  sample_count: { type: "integer", minimum: 1, maximum: 8 },
                  uncertainty_samples: { type: "integer", minimum: 0, maximum: 4, default: 0 },
                  scenarios: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "{ primary, scenarios, indicators, disclaimer }" },
          "503": { description: "Kronos model not loaded; no mock forecast is returned" },
        },
      },
    },
    "/api/predictions/history": {
      get: {
        tags: ["Predictions"],
        summary: "Stored forecasts with evaluation status",
        parameters: [
          { name: "symbol", in: "query", schema: { type: "string" } },
          timeframeParam,
          { name: "horizon", in: "query", schema: { type: "integer", minimum: 1, maximum: 120 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: { "200": { description: "{ items: HistoryItem[] }" } },
      },
    },
    "/api/predictions/accuracy": {
      get: {
        tags: ["Predictions"],
        summary: "Aggregate out-of-sample accuracy",
        description:
          "Only forecasts with completed future candles are included. Pending forecasts are reported separately and never estimated.",
        responses: { "200": { description: "Accuracy groups for overall, symbol, timeframe and horizon" } },
      },
    },
    "/api/predictions/evaluate-pending": {
      post: {
        tags: ["Predictions"],
        summary: "Evaluate mature forecasts",
        description: "Fetches realized Binance candles for stored forecasts whose horizon has closed, then stores metrics.",
        responses: { "200": { description: "{ checked, evaluated, waiting }" } },
      },
    },
    "/api/predictions/export": {
      get: {
        tags: ["Predictions"],
        summary: "Export prediction history CSV",
        parameters: [
          { name: "symbol", in: "query", schema: { type: "string" } },
          timeframeParam,
          { name: "horizon", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "text/csv" } },
      },
    },
    "/api/predictions/{id}": {
      get: {
        tags: ["Predictions"],
        summary: "Forecast replay detail",
        description: "Returns the stored context, forecast candles, realized candles and σ array.",
        parameters: [idParam],
        responses: { "200": { description: "PredictionDetail" }, "404": { description: "Not found" } },
      },
    },
    "/api/predictions/{id}/export": {
      get: {
        tags: ["Predictions"],
        summary: "Export one forecast and its realized candles as CSV",
        parameters: [idParam],
        responses: { "200": { description: "text/csv" } },
      },
    },
    "/api/backtesting/run": {
      post: {
        tags: ["Backtesting"],
        summary: "Walk-forward Kronos evaluation",
        description:
          "Builds windows from historical candles only. Each context ends before the candles it is scored against, so no future bar leaks into inference.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["symbol", "timeframe", "horizon"],
                properties: {
                  symbol: { type: "string", example: "BTCUSDT" },
                  timeframe: {
                    type: "string",
                    enum: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
                  },
                  horizon: { type: "integer", minimum: 1, maximum: 50, default: 5 },
                  lookback: { type: "integer", minimum: 64, maximum: 512, default: 256 },
                  windows: { type: "integer", minimum: 1, maximum: 12, default: 4 },
                  step: { type: "integer", minimum: 1, maximum: 500, default: 32 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "BacktestRun with per-window predicted/actual candles" } },
      },
    },
    "/api/backtesting/results": {
      get: {
        tags: ["Backtesting"],
        summary: "Saved backtest runs",
        responses: { "200": { description: "{ items: BacktestRun[] }" } },
      },
    },
    "/api/backtesting/{id}": {
      get: {
        tags: ["Backtesting"],
        summary: "Full backtest including per-window points",
        parameters: [idParam],
        responses: { "200": { description: "BacktestRun" }, "404": { description: "Not found" } },
      },
    },
    "/api/backtesting/{id}/export": {
      get: {
        tags: ["Backtesting"],
        summary: "Export backtest forecasts and realized candles as CSV",
        parameters: [idParam],
        responses: { "200": { description: "text/csv" } },
      },
    },
    "/api/watchlist": {
      get: {
        tags: ["Watchlist"],
        summary: "Watchlist with tickers and latest prediction summary",
        responses: { "200": { description: "{ items: WatchlistItem[] }" } },
      },
      post: {
        tags: ["Watchlist"],
        summary: "Add or keep a symbol",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["symbol"], properties: { symbol: { type: "string" } } },
            },
          },
        },
        responses: { "201": { description: "Watchlist item" } },
      },
    },
    "/api/watchlist/{id}": {
      delete: {
        tags: ["Watchlist"],
        summary: "Remove a watched symbol",
        parameters: [idParam],
        responses: { "204": { description: "Removed" } },
      },
    },
    "/api/alerts": {
      get: {
        tags: ["Watchlist"],
        summary: "Price and forecast alerts",
        responses: { "200": { description: "{ items: Alert[] }" } },
      },
      post: {
        tags: ["Watchlist"],
        summary: "Create an alert",
        description:
          "Price alerts are evaluated every 30 seconds. Forecast alerts fire once when a new Kronos run matches bullish or bearish direction.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["symbol", "type"],
                properties: {
                  symbol: { type: "string", example: "BTCUSDT" },
                  type: {
                    type: "string",
                    enum: [
                      "price_above",
                      "price_below",
                      "pct_move",
                      "bullish_prediction",
                      "bearish_prediction",
                    ],
                  },
                  value: {
                    type: "number",
                    description: "Required and positive for price_above, price_below and pct_move",
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Alert created" }, "400": { description: "Invalid threshold" } },
      },
    },
    "/api/alerts/{id}": {
      delete: {
        tags: ["Watchlist"],
        summary: "Delete an alert",
        parameters: [idParam],
        responses: { "204": { description: "Deleted" } },
      },
    },
    "/api/model/info": {
      get: {
        tags: ["System"],
        summary: "Kronos model load status and limits",
        responses: {
          "200": {
            description:
              "{ loaded, device, model_id, tokenizer_id, max_context, max_pred_len, default_lookback, params }",
          },
          "503": { description: "AI service unreachable" },
        },
      },
    },
  },
};
