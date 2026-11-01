# API documentation

Interactive docs:

- Node gateway: `http://localhost:3001/docs` (this specification)
- Kronos inference: `http://localhost:8000/docs` (FastAPI)

All gateway routes are under `/api` except `GET /health`. Responses are JSON unless the route is a CSV export.

## Market data

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/market/symbols` | Binance USDT spot pairs, majors first |
| GET | `/api/market/tickers?symbols=BTCUSDT,ETHUSDT` | Batch 24h tickers (max 24 symbols) |
| GET | `/api/market/tickers/all` | Every tradable USDT ticker in one cached snapshot, sorted by 24h quote volume |
| GET | `/api/market/ticker/:symbol` | Single 24h ticker |
| GET | `/api/market/klines/:symbol?timeframe=1h&limit=500` | OHLCV series |
| GET | `/api/market/klines/:symbol?startTime=…&endTime=…` | OHLCV by time range (used for replay) |
| GET | `/api/indicators/:symbol?timeframe=1h` | RSI, MACD, EMA/SMA, Bollinger, ATR, VWAP, StochRSI |

Timeframes: `1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w`. Klines return the currently forming bar last; prediction and backtest code removes it before inference.

## Realtime (Socket.IO)

The gateway shares one Socket.IO connection per browser tab. It proxies Binance streams and broadcasts alert events.

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `subscribe` | `{ "symbol": "BTCUSDT", "timeframe": "1m" }` |
| client → server | `subscribe_tickers` | `{ "symbols": ["BTCUSDT", "ETHUSDT"] }` |
| client → server | `unsubscribe_tickers` | `{ "symbols": ["BTCUSDT"] }` |
| server → client | `kline` | `{ symbol, timeframe, closed, candle }` from the Binance kline stream |
| server → client | `ticker` | `{ symbol, price, change24h, high24h, low24h, volume24h, quoteVolume24h, updatedAt }` from Binance `miniTicker` |
| server → client | `alert` | Triggered alert message and timestamp |

`subscribe_tickers` is reference-counted per socket, so multiple components can watch the same pair without dropping each other. The backend keeps one combined Binance stream for the union of subscribed symbols. Markets and Watchlist also poll the REST ticker endpoint every 20 seconds as a fallback and show an “as of” timestamp.

`GET /api/market/klines` response:

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "candles": [
    { "timestamp": 1767225600000, "open": 93000, "high": 94200, "low": 92800, "close": 94050, "volume": 812.4, "amount": 76400000 }
  ]
}
```

## Predictions

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/predictions/generate` | Run Kronos-base inference and store the result |
| GET | `/api/predictions/history?symbol=&timeframe=&horizon=&limit=` | Stored forecasts with evaluation status |
| GET | `/api/predictions/:id` | Replay detail: context, predicted, realized, σ |
| GET | `/api/predictions/accuracy` | Aggregate out-of-sample metrics |
| POST | `/api/predictions/evaluate-pending` | Fetch realized candles for mature forecasts |
| GET | `/api/predictions/export?symbol=&timeframe=&horizon=` | History CSV |
| GET | `/api/predictions/:id/export` | One forecast + realized candles CSV |

### POST `/api/predictions/generate`

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "horizon": 5,
  "lookback": 400,
  "temperature": 1.0,
  "top_p": 0.9,
  "sample_count": 1,
  "uncertainty_samples": 0,
  "scenarios": false
}
```

Validation:

- `horizon`: one of `1, 3, 5, 10, 20, 50`
- `lookback`: `32…512`
- `uncertainty_samples`: `0…4`; extra independent Kronos passes used only to measure dispersion
- `scenarios`: when true, adds independent 5, 20 and 50 candle runs on the same context
- At least 32 closed candles must be available

Response shape:

```json
{
  "id": "prediction uuid",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "contextLast": { "timestamp": 0, "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0 },
  "indicators": { "rsi": 54.2, "ema20": 93110.4 },
  "primary": {
    "id": "prediction uuid",
    "horizon": 5,
    "result": {
      "predicted": [{ "timestamp": 0, "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0 }],
      "inference_ms": 593.5,
      "lookback": 128,
      "model_version": "kronos-base",
      "sample_close_std": null,
      "uncertainty_samples": 0,
      "transformations": [],
      "notes": []
    },
    "analysis": {
      "marketDirection": "Bullish",
      "predictedPrice": { "nextClose": 0, "lastHorizonClose": 0, "percentMove": 0 },
      "signal": { "direction": "Bullish", "risk": "Moderate", "supporting": [] },
      "uncertainty": { "source": "path-dispersion", "passes": 0, "closeStdFinal": null },
      "explanation": "…",
      "disclaimer": "…"
    }
  },
  "scenarios": [],
  "disclaimer": "…"
}
```

`sample_close_std` is present only when `uncertainty_samples > 0`. Standard deviation across independent passes is **sample dispersion, not a calibrated confidence interval**.

If the model is not loaded the Python service returns HTTP 503 and the gateway returns an error. No random or cached forecast is substituted.

### Accuracy and evaluation

`GET /api/predictions/accuracy` averages only forecasts whose future candles have actually closed:

```json
{
  "overall": {
    "name": "all",
    "runs": 12,
    "candles": 60,
    "mae": { "open": 120.3, "high": 180.1, "low": 175.4, "close": 140.8, "volume": 90.2 },
    "rmse": { "close": 190.5 },
    "directional_accuracy": 0.55,
    "trend_directional_accuracy": 0.58,
    "bullish_directional_accuracy": 0.6,
    "bearish_directional_accuracy": 0.57,
    "bullish_windows": 6,
    "bearish_windows": 6
  },
  "bySymbol": [],
  "byTimeframe": [],
  "byHorizon": [],
  "totals": { "predictions": 18, "evaluated": 12, "pending": 6 },
  "note": "…"
}
```

Metric definitions:

- `mae` / `rmse` / `mape`: per OHLCV field, averaged across overlapping predicted and realized candles.
- `directional_accuracy`: candle body direction (`close >= open`) agreement.
- `trend_directional_accuracy`: horizon close versus the last context close, i.e. the up/down call over the whole forecast.
- `bullish_*` / `bearish_*`: trend accuracy split by the realized direction.

`POST /api/predictions/evaluate-pending` returns `{ checked, evaluated, waiting }`. It is safe to call repeatedly; already-evaluated forecasts are skipped.

## Backtesting

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/backtesting/run` | Run walk-forward windows |
| GET | `/api/backtesting/results` | Latest 30 saved runs |
| GET | `/api/backtesting/:id` | Full run including per-window points |
| GET | `/api/backtesting/:id/export` | CSV with forecast, actual and window metrics |

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "horizon": 5,
  "lookback": 256,
  "windows": 4,
  "step": 24
}
```

Each window uses `lookback` closed candles ending before the realized horizon. `step` is the number of candles between origins. The run fails with HTTP 400 if the requested setup needs more history than Binance returned.

A completed run stores `metrics` (same definitions as predictions) plus `points[]`:

```json
{
  "window": 1,
  "contextStart": 1767000000000,
  "contextEnd": 1767900000000,
  "predicted": [],
  "actual": [],
  "contextLastClose": 94000,
  "ok": true,
  "inferenceMs": 820.4,
  "metrics": { "mae": { "close": 90.2 }, "trend_directional_accuracy": 1 },
  "error": null
}
```

## Watchlist and alerts

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/watchlist` | Symbols with ticker and latest prediction summary |
| POST | `/api/watchlist` | Add `{ "symbol": "BTCUSDT" }` |
| DELETE | `/api/watchlist/:id` | Remove |
| GET | `/api/alerts` | Latest 100 alerts |
| POST | `/api/alerts` | Create alert |
| DELETE | `/api/alerts/:id` | Delete alert |

Alert types:

| Type | `value` | Trigger |
| --- | --- | --- |
| `price_above` | required, positive | 24h ticker price ≥ value |
| `price_below` | required, positive | 24h ticker price ≤ value |
| `pct_move` | required, positive | absolute 24h change ≥ value percent |
| `bullish_prediction` | omitted | next Kronos forecast is Bullish |
| `bearish_prediction` | omitted | next Kronos forecast is Bearish |

Price alerts are polled server-side every 30 seconds. Triggered alerts are marked once, keep their message/timestamp, and are pushed to connected clients over Socket.IO as an `alert` event.

## System

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Gateway liveness |
| GET | `/api/model/info` | Proxied Kronos load status |

`GET /api/model/info` returns the Python service payload: `loaded, device, model_id, tokenizer_id, model_version, max_context, max_pred_len, default_lookback, params, max_uncertainty_samples, notes`. If the AI service is unreachable the gateway returns HTTP 503 with `{ loaded: false, error, detail }`.

## Python AI service

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process and model load status |
| GET | `/model/info` | Context window, device and limits |
| POST | `/predict` | Official `KronosPredictor.predict` + validation |
| POST | `/evaluate` | Batched walk-forward inference and metrics |

`POST /predict` accepts `candles[]`, `pred_len` (`1…120`), `timeframe_ms`, `lookback`, `temperature`, `top_p`, `top_k`, `sample_count`, `uncertainty_samples`. It returns predicted OHLCV, timing, device, transformations and optional dispersion arrays.

`POST /evaluate` accepts `windows[]` with eligible `context` and `actual` candles, plus `timeframe_ms`. It returns aggregate metrics, `windows_evaluated`, `skipped` and per-window `details[]` containing predicted/actual candles and metrics.

## Integrity rules

- Only closed Binance candles are used as inference context. The forming bar is removed.
- The AI service validates and repairs impossible OHLC values; every repair is logged and stored.
- The gateway independently rejects malformed or overlapping forecast candles before storage/charting.
- Metrics exist only where realized candles exist. Accuracy is never estimated or fabricated.
- Walk-forward windows never expose future candles to the model.

## Credits

The forecasting model and vendored inference code come from the official Kronos project: [github.com/shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos). Model card: [NeoQuasar/Kronos-base](https://huggingface.co/NeoQuasar/Kronos-base). Upstream license: MIT, preserved at `ai-service/vendor/kronos/LICENSE`.
