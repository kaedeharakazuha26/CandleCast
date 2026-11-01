# CandleCast

CandleCast is a production-style cryptocurrency candle forecasting terminal built around the official **NeoQuasar/Kronos-base** time-series foundation model ([model card](https://huggingface.co/NeoQuasar/Kronos-base), [source](https://github.com/shiyu-coder/Kronos)).

The UI is an original trading terminal. The inference path is the official `KronosTokenizer` + `Kronos` + `KronosPredictor` pipeline vendored under `ai-service/vendor/kronos` (MIT, ShiYu). Model architecture is unchanged.

Forecasts are sampled K-line paths, not calibrated probabilities and not trade advice.

- **New here?** Read [docs/BEGINNER_GUIDE.md](docs/BEGINNER_GUIDE.md) for a plain-language walkthrough and step-by-step installation.
- **API reference:** [docs/API.md](docs/API.md) or `http://localhost:3001/docs`.
- **Credits:** see [Credits](#credits) at the end of this file.

## What is implemented

- **Markets** — search every Binance USDT spot pair; live `miniTicker` prices with a 20s REST fallback, 24h statistics, gainers/losers/most-active rankings, pagination, quick-add to watchlist.
- **Terminal** — live Binance OHLCV over Socket.IO, EMA/SMA/Bollinger/VWAP/volume overlays, Kronos forecast candles, realized-candle replay overlay.
- **Forecasts** — horizon `1–50`, lookback `128–512`, temperature/top-p/sample controls, optional multi-scenario (`5/20/50`) runs, optional ±1σ dispersion from extra independent Kronos passes.
- **History** — stored forecast replay, predicted-vs-realized tables, per-field MAE/RMSE/MAPE, candle-body and horizon-trend direction accuracy, CSV export.
- **Accuracy** — aggregate only over forecasts whose future candles actually closed; pending forecasts are excluded, never estimated.
- **Backtesting** — walk-forward windows with no look-ahead, per-window charts and metrics, saved runs, CSV export.
- **Watchlist and alerts** — live tickers with a 20s REST fallback, latest prediction, price-above/price-below/percent-move and bullish/bearish-forecast alerts, server-side monitor with Socket.IO toasts.
- **Settings** — live model/device/limits status and explicit integrity/limitation notes.

## Architecture

- **frontend**: React, Vite, TypeScript, Tailwind, Lightweight Charts, Zustand, Socket.IO
- **backend**: Node.js, Express, Prisma/PostgreSQL, Redis cache (in-memory fallback), Binance REST + WebSocket
- **ai-service**: FastAPI + PyTorch serving Kronos-base over HTTP
- Kronos never runs inside Node. The backend only forwards closed OHLCV candles and stores results.

## Kronos constraints (from the official repo)

| Setting | Kronos-base |
| --- | --- |
| Tokenizer | `NeoQuasar/Kronos-Tokenizer-base` |
| Max context | 512 bars (longer lookbacks are truncated by the model) |
| Default lookback in this app | 400 |
| Forecast length | Autoregressive. Official examples use `pred_len` up to 120. The UI allows 1–50; the AI service rejects >120 instead of inventing rollouts. |
| Inputs | `open, high, low, close` required; `volume` and `amount` optional (amount ≈ volume × typical price when missing) |
| Sampling | `T`, `top_p`, `top_k`, `sample_count` as in `KronosPredictor.predict` |
| Uncertainty | Extra independent passes report sample standard deviation. This is path dispersion, not calibrated confidence. |

## Hardware

- CPU inference works and is the default fallback.
- A CUDA GPU is strongly recommended. Kronos-base is ~102.3M parameters.
- Budget 8 GB RAM for CPU; more if you raise `sample_count` or uncertainty passes.
- First start downloads weights from Hugging Face into `HF_HOME`.

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8080`. The AI container may take several minutes on first boot while it pulls Kronos-base.

## Local development

### 1. Database

Use any PostgreSQL 16 instance compatible with `.env.example`, or start the bundled no-admin development database:

```bash
cd backend
npm run db:local
```

`db:local` runs `embedded-postgres` on `127.0.0.1:5432` with user/password/database `kronos/kronos/kronos`. Redis is optional; the backend falls back to an in-process cache.

### 2. AI service

Python 3.10+:

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set PYTHONPATH=.
uvicorn app.main:app --port 8000
```

Weights are loaded once and reused. If Windows cannot create Hugging Face cache symlinks, download to a local directory:

```python
from huggingface_hub import snapshot_download
snapshot_download("NeoQuasar/Kronos-base", local_dir=".cache/models/Kronos-base")
snapshot_download("NeoQuasar/Kronos-Tokenizer-base", local_dir=".cache/models/Kronos-Tokenizer-base")
```

Then point `ai-service/.env` at those directories:

```dotenv
MODEL_ID=./.cache/models/Kronos-base
TOKENIZER_ID=./.cache/models/Kronos-Tokenizer-base
DEVICE=auto
```

### 3. Backend and frontend

```bash
cd backend
copy ..\.env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:5173`  
API docs: `http://localhost:3001/docs`  
Inference docs: `http://localhost:8000/docs`

## Configuration

Backend (`.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://kronos:kronos@localhost:5432/kronos?schema=public` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Cache; falls back to memory |
| `AI_SERVICE_URL` | `http://localhost:8000` | Python inference service |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origins, comma separated |
| `PORT` | `3001` | Gateway port |
| `PREDICTION_TIMEOUT_MS` | `600000` | Forecast request timeout |
| `BACKTEST_TIMEOUT_MS` | `1800000` | Walk-forward timeout |

AI service (`.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODEL_ID` | `NeoQuasar/Kronos-base` | Hugging Face ID or local directory |
| `TOKENIZER_ID` | `NeoQuasar/Kronos-Tokenizer-base` | Tokenizer ID or local directory |
| `DEVICE` | `auto` | `cpu`, `cuda` or `auto` |
| `SKIP_MODEL_LOAD` | `false` | Start without weights (endpoints return 503) |
| `HF_HOME` | `.cache/huggingface` | Hugging Face cache |

## Using the terminal

1. Pick a Binance USDT pair and timeframe, or select one from **Markets**.
2. Historical candles load from Binance; the live socket patches the current bar.
3. Choose a horizon, lookback, uncertainty passes and optionally multi-scenario, then click **Generate forecast**.
4. Blue-bordered candles are Kronos estimates overlaid after the last closed bar; dotted lines are ±1σ sample dispersion when requested.
5. Add EMA/SMA/Bollinger/VWAP/volume overlays independently of the model.
6. Use **History** to replay a stored forecast against candles that closed later, or evaluate mature forecasts.
7. Use **Backtesting** to score multiple walk-forward origins with the same Kronos model.
8. Use **Watchlist** to track pairs and arm price/forecast alerts.

## Tests

```bash
cd ai-service && .venv\Scripts\python.exe -m pytest -q
cd backend && npm test
cd frontend && npm test
```

Python tests cover candle repair, metric definitions, trend accuracy and timestamp generation. Backend tests cover indicators, metric parity with Python, and independent forecast validation. Frontend tests cover formatting, direction helpers and candle invariants. Tests do **not** download Kronos-base or require a GPU.

## Integrity rules and limitations

- Invalid model OHLC (high < max(open, close), negative volume, etc.) is repaired only after a warning is logged and the transformation is stored on the prediction record. The Node gateway independently rejects malformed or overlapping forecast candles.
- Missing exchange data is reported, not interpolated into fake prices.
- Accuracy numbers appear only after realized candles exist for a forecast. They are not profitability claims.
- Walk-forward windows never include a future bar in the model context.
- Uncertainty bands describe dispersion across sampled Kronos paths/passes, not calibrated probabilities.
- The app does not place orders or connect to an exchange account.
- Binance rate limits can make market views empty; the UI surfaces the failure instead of synthesizing data.

## API

See [docs/API.md](docs/API.md) or the live Swagger UI at `http://localhost:3001/docs`.

## Credits

CandleCast is built on the **Kronos** financial foundation model by ShiYu and the Kronos contributors.

- **Official Kronos repository:** [github.com/shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos)
- **Kronos-base model card:** [NeoQuasar/Kronos-base](https://huggingface.co/NeoQuasar/Kronos-base)
- **Tokenizer:** [NeoQuasar/Kronos-Tokenizer-base](https://huggingface.co/NeoQuasar/Kronos-Tokenizer-base)
- **Paper:** [Kronos: A Foundation Model for the Language of Financial Markets](https://huggingface.co/papers/2508.02739)
- **Upstream license:** MIT, preserved at `ai-service/vendor/kronos/LICENSE`

The vendored inference code under `ai-service/vendor/kronos` remains the work of the upstream Kronos authors. CandleCast adds the terminal UI, Node gateway, database-backed history, backtesting, watchlist, alerts, and deployment glue. Kronos model weights are downloaded from Hugging Face and are not committed to this repository.

## License

Application code in this repository is provided for this project. Vendored Kronos model files remain under the upstream MIT license in `ai-service/vendor/kronos/LICENSE`.
