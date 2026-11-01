# CandleCast

**Crypto candle forecasting in a trading terminal, powered by the official [Kronos-base](https://huggingface.co/NeoQuasar/Kronos-base) model and real Binance market data.**

![CandleCast terminal showing a Kronos forecast over real BTCUSDT candles](docs/screenshots/terminal.png)

CandleCast downloads real OHLCV candles from Binance, asks a local Python service running Kronos-base for the next candles, and draws those estimates on the chart. It stores every forecast so you can compare it with what actually happened later, and it can walk forward through history to measure the model without look-ahead.

> **This is a research tool, not trading advice.** Forecasts are sampled model paths. They are not calibrated probabilities, guaranteed prices, or signals to buy or sell. CandleCast never connects to an exchange account and never places orders.

New to the project? This README walks you through installation and first use. For a longer plain-language explanation of the architecture, see **[docs/BEGINNER_GUIDE.md](docs/BEGINNER_GUIDE.md)**.

---

## Contents

- [What it does](#what-it-does)
- [What it looks like](#what-it-looks-like)
- [How it works](#how-it-works)
- [Install](#install)
- [Your first forecast](#your-first-forecast)
- [Everyday start and stop](#everyday-start-and-stop)
- [Troubleshooting](#troubleshooting)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Accuracy and limitations](#accuracy-and-limitations)
- [Credits](#credits)

---

## What it does

| Feature | What you get |
| --- | --- |
| **Markets** | Every tradable Binance USDT pair (500+), live prices, search, gainers/losers/most-active rankings, one-click open in the terminal |
| **Terminal** | Candlestick chart with EMA/SMA/Bollinger/VWAP/volume overlays and blue-bordered Kronos forecast candles |
| **Forecasts** | 1–50 future candles, lookback 128–512, temperature/top-p controls, optional multi-scenario runs and ±1σ dispersion |
| **History** | Every stored forecast replayed against the candles that followed, with MAE/RMSE/MAPE and direction accuracy |
| **Backtesting** | Walk-forward windows evaluated with no future data, saved runs and CSV export |
| **Watchlist** | Saved pairs, latest forecast, price-above/price-below/percent-move and forecast-direction alerts |
| **Settings** | Live model, device, context window and integrity notes straight from the inference service |

### What is real, and what is estimated?

| Thing you see | Where it comes from |
| --- | --- |
| Historical candles | Binance public REST API |
| Live price and current candle | Binance WebSocket, relayed by the backend |
| Forecast candles | Kronos-base sample paths from the local Python service |
| Accuracy, MAE, RMSE | Calculated only after real future candles close |
| Alerts | Backend checks real prices and stored forecasts |

If Binance or the model is unavailable, the UI shows an error. It does not invent candles, prices, or accuracy numbers.

---

## What it looks like

### Terminal — the main page

![Terminal forecast detail with predicted candle table and stored accuracy](docs/screenshots/terminal-forecast.png)

Pick a pair, choose a horizon and lookback, and press **Generate forecast**. Green/red candles are real Binance history. Blue-bordered candles after the last closed bar are the model's estimates. The right panel summarises the prediction, its range, the supporting indicators, and a plain-language explanation. Below the chart you get the exact predicted candles, recent runs, and stored accuracy — here **1 of 7** forecasts was mature enough to score, which is exactly the kind of sample size you should check before trusting a number. The disclaimer in the panel is intentional: a sampled path is not a probability of profit.

### Markets — find any coin

![Markets page with top movers and pair table](docs/screenshots/markets.png)

The **Top movers** panel ranks the whole market by gainers, losers, or 24h volume. Below it, the searchable table covers every USDT pair on Binance. **Watch** adds a pair to your watchlist; **Open** loads it in the Terminal.

### Watchlist — track pairs and alerts

![Watchlist with live prices and alert form](docs/screenshots/watchlist.png)

Each row streams a live price and shows the latest stored forecast direction. You can arm a price threshold, a 24h percentage move, or a bullish/bearish forecast alert. The backend checks alerts every 30 seconds.

### History — did the forecast hold up?

![History page with stored forecasts and accuracy cards](docs/screenshots/history.png)

Forecasts stay **pending** until their future candles exist. Once they close, **Evaluate mature forecasts** computes real error metrics. The 100% in this screenshot comes from a single evaluated forecast at capture time — it is a sample-size warning, not a reliability claim. Always read the sample counts.

### Backtesting — test across history

![Walk-forward backtesting page](docs/screenshots/backtesting.png)

A walk-forward run places the model at several past origins, gives it only the candles that existed then, and scores the forecast against what came next. No future bar ever enters the context. CPU inference makes runs slow; start with 4 windows.

### Settings — is the model actually loaded?

![Settings page with model and runtime status](docs/screenshots/settings.png)

This page reports the real state of the inference process: device (CPU/CUDA/MPS), context window, checkpoint paths, and the limits the app enforces. If the AI service is offline, this page says so instead of pretending.

---

## How it works

```
Browser (React + Vite)
   │  REST /api + Socket.IO
   ▼
Node backend (Express + Prisma)
   │                         │
   │ HTTP                    │ WebSocket
   ▼                         ▼
Python AI service        Binance public data
(FastAPI + PyTorch)      (prices + candles)
   │
   ▼
Kronos-base model
```

- **frontend** — React, TypeScript, Tailwind, Lightweight Charts, Zustand, Socket.IO.
- **backend** — Express API, Prisma/PostgreSQL history, Redis cache (falls back to memory), Binance REST and WebSocket proxies.
- **ai-service** — FastAPI + PyTorch. Loads Kronos-base once and answers HTTP prediction requests. It is fully independent of Node.
- **PostgreSQL** — stores forecasts, evaluation metrics, backtest runs, watchlist, and alerts.

Kronos never runs inside Node. The backend sends closed candles to Python and stores the result.

---

## Install

### What you need

| Requirement | Notes |
| --- | --- |
| **Node.js 20+** and npm | `node --version` should print v20 or newer |
| **Python 3.10–3.12** | 3.11 is the safest choice for PyTorch |
| **Git** | Only if you clone the repository |
| **Internet** | Binance data and the first Hugging Face model download |
| **~8 GB RAM** | For CPU inference; a CUDA GPU is optional and much faster |
| **A few GB of disk** | Python packages plus model weights |

No Redis or external PostgreSQL install is required: the project can start its own local database and falls back to an in-memory cache.

### Option A — Docker (easiest)

Use this if Docker Desktop is installed. It starts PostgreSQL, Redis, the AI service, the backend, and the frontend together.

```bash
docker compose up --build
```

Then open **http://localhost:8080**.

- The first AI container start downloads Kronos-base, so it can take several minutes. Watch the `ai-service` logs until it reports the model loaded.
- The compose file gives the AI container up to 8 GB of memory.
- You do **not** need to create any `.env` file for Docker; the compose file sets the values.

To stop:

```bash
docker compose down
```

To also delete the database and downloaded model cache:

```bash
docker compose down -v
```

### Option B — Run it locally

You will use **four terminals**: database, backend, AI service, frontend. Keep them open. Open each new terminal in the repository root, then run that step's commands.

Commands below are for Windows PowerShell first, with macOS/Linux equivalents.

#### Step 1 — Start the database

```powershell
cd backend
npm install
npm run db:local
```

Leave this terminal running. It starts PostgreSQL on `127.0.0.1:5432` and creates the `kronos` user, password, and database. The data lives in `backend/.pgdata`, which Git ignores.

You should see:

```text
PostgreSQL listening on 127.0.0.1:5432 (user=kronos, database=kronos)
```

If you already run PostgreSQL 16 yourself, skip this and point `DATABASE_URL` at your instance instead.

#### Step 2 — Start the backend

Open a **second** terminal:

```powershell
cd backend
Copy-Item ..\.env.example .env
npx prisma generate
npx prisma migrate deploy
npm run dev
```

macOS/Linux:

```bash
cd backend
cp ../.env.example .env
npx prisma generate
npx prisma migrate deploy
npm run dev
```

You should see:

```text
API listening on 3001
```

Check it in a browser or with curl:

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

> **Windows note:** if `prisma generate` fails with `EPERM`, something is still holding the generated Prisma DLL. Stop the process using port 3001 and run it again.

#### Step 3 — Start the AI service

Open a **third** terminal:

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PYTHONPATH="."
uvicorn app.main:app --port 8000
```

macOS/Linux:

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --port 8000
```

The first start downloads the model and tokenizer from Hugging Face. Wait until the log shows the model loaded, then check:

```bash
curl http://localhost:8000/health
# {"status":"ok","loaded":true,"device":"cpu","model_version":"kronos-base"}
```

If `loaded` is `false`, the download or load failed — read the terminal output. The UI will refuse to forecast until this is fixed.

**Windows symlink problem:** if Hugging Face cannot create cache symlinks, download the weights into normal folders:

```powershell
cd ai-service
.\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('NeoQuasar/Kronos-base', local_dir='.cache/models/Kronos-base'); snapshot_download('NeoQuasar/Kronos-Tokenizer-base', local_dir='.cache/models/Kronos-Tokenizer-base')"
```

Then create `ai-service/.env`:

```dotenv
MODEL_ID=./.cache/models/Kronos-base
TOKENIZER_ID=./.cache/models/Kronos-Tokenizer-base
DEVICE=auto
```

Restart the AI service after changing `.env`.

#### Step 4 — Start the frontend

Open a **fourth** terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints — usually **http://localhost:5173**. If that port is busy, Vite picks the next one (for example 5174).

> If Vite uses 5174, add it to the backend CORS list in `backend/.env`: `FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174`, then restart the backend.

#### Step 5 — Confirm everything is connected

| Check | Expected |
| --- | --- |
| `http://localhost:3001/health` | `{"status":"ok"}` |
| `http://localhost:8000/health` | `"loaded": true` |
| App header | Green **Live** dot and prices moving |
| Settings page | **Kronos ready**, device shown |

Useful links:

- App: `http://localhost:5173` (or the port Vite printed)
- Backend API docs: `http://localhost:3001/docs`
- AI service docs: `http://localhost:8000/docs`

---

## Your first forecast

1. **Open Markets** and find a pair. Search `BTC`, `ETH`, or `SOL`, or use the Top movers cards. Press **Open** to load it in the Terminal.
2. **Choose a timeframe** — `1h` is a good starting point. The chart loads 500 real Binance candles.
3. **Leave the defaults** for your first run: `Next 5 candles`, `Lookback 400`, `Single pass`. This is the fastest setting on CPU.
4. **Press Generate forecast.** A spinner shows elapsed seconds. On CPU this can take a few seconds; extra scenarios and dispersion passes take longer.
5. **Read the chart.** Blue-bordered candles after the last closed bar are the forecast. The legend shows `actual`, `forecast`, and `realized` (realized appears in replay).
6. **Read the AI panel.** It shows the next predicted close, the move across the horizon, the forecast range, supporting indicators, and an explanation. Treat the range as sampled path dispersion, not a confidence interval.
7. **Open History.** Your forecast is stored and marked `pending`. When its future candles close, press **Evaluate mature forecasts** to compute real errors.
8. **Try Backtesting** with 4 windows to see how the model behaves at different past origins. Keep windows low on CPU.
9. **Use Watchlist** to track pairs and arm alerts. Alerts are evaluated server-side every 30 seconds.

### Tips for reading results honestly

- A single good-looking forecast means nothing. Look at sample counts and many windows.
- Direction accuracy is not profitability. A strategy also pays fees, spread, and slippage.
- The same context can produce different forecasts because sampling is stochastic.
- Pending forecasts are excluded from accuracy. The app never guesses their outcome.
- Historical candles come from Binance spot, which may differ from the venue you trade on.

---

## Everyday start and stop

After the first setup, you do not need to reinstall anything or re-run migrations. Start the four pieces again:

```powershell
# Terminal 1 — database
cd backend
npm run db:local

# Terminal 2 — backend
cd backend
npm run dev

# Terminal 3 — AI service (activate the venv first)
cd ai-service
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="."
uvicorn app.main:app --port 8000

# Terminal 4 — frontend
cd frontend
npm run dev
```

Stop each with `Ctrl+C`.

Re-run `npx prisma migrate deploy` only after pulling schema changes. Delete `backend/.pgdata` only if you want to reset the local database.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Port 3001 already in use` | An old backend is still running | Stop it, or change `PORT` in `backend/.env` |
| App opens but shows no data | Backend not running | Check `http://localhost:3001/health` |
| `Can't reach database server` | PostgreSQL is not running | Start `npm run db:local` or your own PostgreSQL |
| `Table does not exist` | Migrations were not applied | `cd backend && npx prisma migrate deploy` |
| AI panel says offline | AI service not running | Start `uvicorn app.main:app --port 8000` |
| Forecast returns 503 | Model still loading or failed | Check the AI terminal and `/health` |
| Model download fails | No internet, blocked Hugging Face, or full disk | Retry, free space, or use the `snapshot_download` workaround |
| CPU inference is slow | Normal without a GPU | Lower horizon/lookback, use single pass, reduce backtest windows |
| `EPERM` from Prisma on Windows | The backend holds the generated client | Stop the process on port 3001, run `npx prisma generate` |
| Header shows **polling** instead of **streaming** | Socket.IO stream is stale | REST fallback is working; check backend and Binance connectivity |
| Prices are empty | Binance rate limit or regional block | Wait and retry from a permitted network |
| Vite runs on 5174 | 5173 is busy | Add `http://localhost:5174` to `FRONTEND_ORIGIN` and restart the backend |

---

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://kronos:kronos@localhost:5432/kronos?schema=public` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Cache; falls back to memory |
| `AI_SERVICE_URL` | `http://localhost:8000` | Python inference service |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origins, comma separated |
| `PORT` | `3001` | Gateway port |
| `BINANCE_REST_URL` | `https://api.binance.com` | Market data REST base |
| `BINANCE_WS_URL` | `wss://stream.binance.com:9443/ws` | Market data WebSocket base |
| `PREDICTION_TIMEOUT_MS` | `600000` | Forecast request timeout |
| `BACKTEST_TIMEOUT_MS` | `1800000` | Walk-forward timeout |

The `kronos` database/user names are local development defaults, not product branding. Change them if you also update `DATABASE_URL`.

### AI service (`ai-service/.env`, optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODEL_ID` | `NeoQuasar/Kronos-base` | Hugging Face ID or local directory |
| `TOKENIZER_ID` | `NeoQuasar/Kronos-Tokenizer-base` | Tokenizer ID or local directory |
| `DEVICE` | `auto` | `cpu`, `cuda` or `auto` |
| `SKIP_MODEL_LOAD` | `false` | Start without weights (prediction endpoints return 503) |
| `HF_HOME` | `.cache/huggingface` | Hugging Face cache directory |

### Kronos limits enforced by the app

| Setting | Kronos-base |
| --- | --- |
| Max context | 512 bars |
| Default lookback | 400 |
| Forecast length | 1–120 accepted by the service; UI offers 1–50 |
| Sampling | temperature, top-p, top-k, sample count |
| Uncertainty | Extra independent passes, reported as sample standard deviation |

---

## Project layout

```text
backend/              Node API, Prisma schema, Binance proxies, Socket.IO, alerts
frontend/             React + Vite terminal
ai-service/           FastAPI + PyTorch inference service
  vendor/kronos/      Official Kronos inference code (MIT, unchanged)
docs/
  API.md              REST and Socket.IO reference
  BEGINNER_GUIDE.md   Longer plain-language setup and architecture guide
  screenshots/        Images used in this README
docker-compose.yml    Full stack with PostgreSQL, Redis and the AI service
.env.example          Backend and AI defaults
```

---

## Tests

```bash
cd ai-service && .venv\Scripts\python.exe -m pytest -q   # Windows
cd ai-service && .venv/bin/python -m pytest -q           # macOS/Linux
cd backend && npm test
cd frontend && npm test
```

Tests do **not** download Kronos-base or require a GPU. They cover candle validation, metric parity between Node and Python, indicator maths, timestamp generation, and frontend formatting invariants.

For a production build:

```bash
cd backend && npm run build
cd frontend && npm run build
```

---

## Accuracy and limitations

- Forecast OHLC is validated twice: the AI service repairs and logs impossible candles, and the Node gateway rejects malformed or overlapping forecasts.
- Missing exchange data is reported, never interpolated into fake prices.
- Accuracy appears only when realized candles exist. Pending forecasts are excluded.
- Walk-forward contexts never include a future bar.
- Uncertainty bands describe dispersion across sampled Kronos paths/passes, not calibrated probabilities.
- Binance rate limits or outages can leave market views empty; the UI surfaces the failure.
- The app is read-only with respect to exchanges. It does not place orders or hold keys.

---

## Credits

CandleCast is built on the **Kronos** financial foundation model by ShiYu and the Kronos contributors.

- **Official repository:** [github.com/shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos)
- **Model card:** [NeoQuasar/Kronos-base](https://huggingface.co/NeoQuasar/Kronos-base)
- **Tokenizer:** [NeoQuasar/Kronos-Tokenizer-base](https://huggingface.co/NeoQuasar/Kronos-Tokenizer-base)
- **Paper:** [Kronos: A Foundation Model for the Language of Financial Markets](https://huggingface.co/papers/2508.02739)
- **Upstream license:** MIT, preserved at `ai-service/vendor/kronos/LICENSE`

The vendored inference code remains the work of the upstream Kronos authors. CandleCast adds the terminal UI, Node gateway, database-backed history, evaluation, walk-forward backtesting, watchlist, alerts, and deployment glue. Model weights are downloaded from Hugging Face and are not committed to this repository.

## License

Application code in this repository is provided for this project. Vendored Kronos files remain under the upstream MIT license in `ai-service/vendor/kronos/LICENSE`.
