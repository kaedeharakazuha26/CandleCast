# CandleCast — beginner guide

This guide is for someone who has never run CandleCast before. It explains what the app does, how the pieces fit together, and how to install and start it on Windows, macOS or Linux.

If you only want the short version, use the **Docker quick start** below. If you want to run the code directly, follow the **local development** steps.

> **Important:** CandleCast is a research and visualisation tool. Kronos forecasts are sampled model paths, not calibrated probabilities, guaranteed prices or trading advice. The app does not place orders or connect to an exchange account.

---

## 1. What CandleCast does

CandleCast is a crypto candle forecasting terminal. It:

1. Downloads historical OHLCV candles from Binance's public spot API.
2. Sends closed candles to a local Python service running the official **Kronos-base** model.
3. Draws the model's forecast candles over the chart.
4. Stores forecasts so you can compare them with what actually happened later.
5. Runs walk-forward backtests across multiple historical starting points.
6. Streams live prices and the current candle from Binance.
7. Tracks a watchlist and evaluates price/forecast alerts.

### What is real, and what is estimated?

| Data | Source |
| --- | --- |
| Historical candles | Binance public REST API |
| Live price / current candle | Binance WebSocket, forwarded through the backend |
| Forecast candles | Kronos-base model sample paths |
| Accuracy / MAE / RMSE | Calculated only after real future candles close |
| Alerts | Backend checks real prices/forecasts |

Nothing in the forecast path is mocked. If the model or exchange is unavailable, the UI shows an error instead of inventing data.

### Main pages

- **Markets** — searchable list of Binance USDT pairs with live prices, plus gainers/losers/most-active rankings.
- **Terminal** — chart, indicators, forecast controls and AI summary.
- **History** — stored forecasts replayed against realized candles.
- **Backtesting** — walk-forward evaluation with no look-ahead.
- **Watchlist** — saved pairs, latest forecasts and price alerts.
- **Settings** — model, device, limits and integrity notes.

---

## 2. How the program works

CandleCast has three services plus a database:

```text
Browser (React + Vite)
   │  REST /api + Socket.IO
   ▼
Node backend (Express + Prisma)
   │                         │
   │ HTTP                    │ WebSocket
   ▼                         ▼
Python AI service        Binance public streams
(FastAPI + PyTorch)      (prices + candles)
   │
   ▼
Kronos-base model
```

1. The **frontend** shows the terminal and talks to the backend. In development, Vite proxies `/api` and `/socket.io` to the backend.
2. The **backend** fetches Binance candles, stores predictions/backtests/alerts in PostgreSQL, exposes the REST API, and relays Binance socket data to the browser.
3. The **AI service** loads the model once at startup, then answers `POST /predict` requests. It is independent of Node; the backend only calls it over HTTP.
4. **PostgreSQL** stores prediction history, evaluation metrics, backtest runs, the watchlist and alerts.
5. **Redis** is optional. If it is not running, the backend uses an in-process cache.

### Why the AI service is separate

Kronos is a PyTorch model. Keeping it in Python means the Node backend never needs a Python bridge, and the model can run on CPU, CUDA or Apple MPS without changing the web app.

### Key words

- **Candle / OHLCV** — open, high, low, close, volume for one time period.
- **Timeframe** — candle size, for example `1m`, `1h` or `1d`.
- **Horizon** — how many future candles the model should generate.
- **Lookback** — how many past candles are given to the model (Kronos-base supports up to 512).
- **Walk-forward** — test a forecast at an old point in time, then compare it with the candles that came later.
- **σ dispersion** — spread across independent model passes. It is not a calibrated confidence interval.

---

## 3. Before you start

You need:

- **Node.js 20 or newer** and npm.
- **Python 3.10 or newer** (3.10 or 3.11 is the safest choice for PyTorch).
- **Git** if you are cloning the repository.
- **Internet access** for Binance data and the first Hugging Face model download.
- **About 8 GB RAM** for CPU inference. A CUDA GPU is optional but much faster.
- **A few GB of free disk space** for Python packages and model weights.

Check your versions:

```bash
node --version
npm --version
python --version
git --version
```

### Get the code

```bash
git clone <your-repository-url>
cd <repository-folder>
```

If you downloaded a ZIP instead, extract it and open a terminal in that folder.

> Never commit `.env` files. They are ignored by Git because they can contain local paths and credentials.

---

## 4. Option A — Docker quick start

This is the fastest path if Docker Desktop is installed. The compose file already contains the database, cache, and service configuration, so no `.env` file is required.

```bash
docker compose up --build
```

Then open **http://localhost:8080**.

The first AI container start can take several minutes while it downloads Kronos-base. Docker needs enough memory for the AI container (the compose file requests up to 8 GB).

To stop:

```bash
docker compose down
```

To remove the database and downloaded model cache as well:

```bash
docker compose down -v
```

---

## 5. Option B — local development

You will run four terminals: database, backend, AI service and frontend. Keep each one open.

### Step 1 — Create the backend environment file

```powershell
cd backend
Copy-Item ..\.env.example .env
```

On macOS/Linux:

```bash
cd backend
cp ../.env.example .env
```

The important defaults are:

```dotenv
DATABASE_URL=postgresql://kronos:kronos@localhost:5432/kronos?schema=public
AI_SERVICE_URL=http://localhost:8000
FRONTEND_ORIGIN=http://localhost:5173
PORT=3001
```

The `kronos` database/user names are local development defaults, not product branding. You can change them if you also change `DATABASE_URL` and the database itself.

If Vite picks a different port because 5173 is busy, add it to CORS:

```dotenv
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174
```

### Step 2 — Start PostgreSQL

The project includes a no-admin local PostgreSQL option. From the `backend` folder:

```bash
npm install
npm run db:local
```

Leave this terminal running. It starts PostgreSQL on `127.0.0.1:5432` with:

- user: `kronos`
- password: `kronos`
- database: `kronos`
- data directory: `backend/.pgdata` (ignored by Git)

If you already have PostgreSQL 16 running, you can use it instead by editing `DATABASE_URL`.

### Step 3 — Prepare and start the backend

Open a **second** terminal:

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Expected output includes `API listening on 3001`.

Check it:

```bash
curl http://localhost:3001/health
```

You should see `{"status":"ok"}`.

> If `prisma generate` fails on Windows with `EPERM`, stop anything using port 3001 and run it again. A running backend can lock Prisma's generated DLL.

### Step 4 — Start the AI service

Open a **third** terminal:

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PYTHONPATH="."
uvicorn app.main:app --port 8000
```

On macOS/Linux:

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --port 8000
```

Create `ai-service/.env`:

```dotenv
MODEL_ID=NeoQuasar/Kronos-base
TOKENIZER_ID=NeoQuasar/Kronos-Tokenizer-base
DEVICE=auto
HF_HOME=.cache/huggingface
```

The first start downloads the model and tokenizer from Hugging Face. Watch the terminal until you see that the predictor is ready.

Check it:

```bash
curl http://localhost:8000/health
```

You should see `"loaded": true`. On CPU, loading and inference are slower than on a GPU.

#### Windows symlink problem

If Hugging Face cannot create cache symlinks, download the weights to normal folders:

```powershell
cd ai-service
.\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('NeoQuasar/Kronos-base', local_dir='.cache/models/Kronos-base'); snapshot_download('NeoQuasar/Kronos-Tokenizer-base', local_dir='.cache/models/Kronos-Tokenizer-base')"
```

Then set `ai-service/.env` to:

```dotenv
MODEL_ID=./.cache/models/Kronos-base
TOKENIZER_ID=./.cache/models/Kronos-Tokenizer-base
DEVICE=auto
```

### Step 5 — Start the frontend

Open a **fourth** terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually **http://localhost:5173**. If 5173 is busy, Vite will print the next free port (for example 5174).

Useful URLs:

- App: `http://localhost:5173` (or the printed port)
- Backend API docs: `http://localhost:3001/docs`
- AI service docs: `http://localhost:8000/docs`

---

## 6. Your first forecast

1. Open **Markets** and choose a pair such as `BTCUSDT`, or enter a symbol in the Terminal.
2. Choose a timeframe (`1h` is a good start).
3. Leave horizon at `Next 5 candles` and lookback at `400`.
4. Leave uncertainty at **Single pass** for the fastest response.
5. Click **Generate forecast**.
6. The blue-bordered candles after the last real candle are Kronos estimates.
7. Read the AI panel: predicted next close, horizon move, direction, signal, risk and explanation.
8. Open **History** to see stored forecasts. A forecast stays `pending` until its future candles close.
9. Click **Evaluate mature forecasts** after enough time has passed to calculate real metrics.
10. Open **Backtesting** to run a walk-forward test across several historical windows.

CPU inference can take about a second or more per request. Extra uncertainty passes and multi-scenario runs take longer.

### How to read the chart

- **Green/red candles** — real Binance history.
- **Blue-bordered candles** — Kronos forecast.
- **Amber candles** — realized candles in replay.
- **Dotted blue lines** — ±1σ dispersion from independent passes, when requested.

### Accuracy rules

- Nothing is scored until the real future candles exist.
- Pending forecasts are excluded from accuracy.
- Direction accuracy is not a profitability claim.
- Walk-forward backtests never let the model see a future candle.

---

## 7. Stopping and restarting

Stop each terminal with `Ctrl+C`.

To restart later:

1. Start PostgreSQL: `cd backend && npm run db:local`
2. Start backend: `cd backend && npm run dev`
3. Start AI service: activate the venv and run `uvicorn app.main:app --port 8000`
4. Start frontend: `cd frontend && npm run dev`

You do **not** need to reinstall packages or re-run migrations every time. Re-run migrations only after pulling schema changes.

---

## 8. Common problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Port 3001 already in use` | Old backend still running | Stop it, or set `PORT` to another value |
| Frontend opens but data fails | Backend not running | Check `http://localhost:3001/health` |
| `Can't reach database server` | PostgreSQL not running | Start `npm run db:local` or your own PostgreSQL |
| `Table does not exist` | Migrations not applied | `cd backend && npx prisma migrate deploy` |
| AI panel says offline | AI service not running | Start `uvicorn app.main:app --port 8000` |
| Forecast returns 503 | Model still loading or failed to load | Check the AI terminal and `/health` |
| Model download fails | No internet, Hugging Face blocked, or disk full | Retry, free space, or use the `snapshot_download` commands |
| CPU inference very slow | Normal on CPU | Use a smaller horizon/lookback, or run on CUDA |
| `EPERM` from Prisma on Windows | Backend process locks the generated client | Stop the process on port 3001, run `npx prisma generate` again |
| Live indicator is off | Socket.IO connection failed | Check backend and the Vite proxy; reload the page |
| Prices show `polling` | Live stream is stale or unavailable | REST fallback is working; check backend/Binance connectivity |
| Binance returns errors | Rate limit or regional restriction | Wait and retry; use a permitted network |
| Vite port is 5174 | 5173 is busy | Add `http://localhost:5174` to `FRONTEND_ORIGIN` if needed |

---

## 9. Project layout

```text
backend/       Node API, Prisma, PostgreSQL, Binance proxies, Socket.IO
frontend/      React + Vite terminal
ai-service/    FastAPI + PyTorch inference service
  vendor/kronos/   Official Kronos inference code (MIT)
docs/          API reference and guides
docker-compose.yml
.env.example
```

Useful commands:

```bash
# Backend
cd backend
npm run dev          # start API with reload
npm test             # backend tests
npm run build        # TypeScript build

# Frontend
cd frontend
npm run dev          # start Vite
npm test             # frontend tests
npm run build        # production build

# AI service
cd ai-service
.venv\Scripts\python.exe -m pytest -q     # Windows
.venv/bin/python -m pytest -q              # macOS/Linux
```

---

## 10. Credits

CandleCast would not exist without the official **Kronos** project:

- **Repository:** [https://github.com/shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos)
- **Model card:** [NeoQuasar/Kronos-base](https://huggingface.co/NeoQuasar/Kronos-base)
- **Tokenizer:** [NeoQuasar/Kronos-Tokenizer-base](https://huggingface.co/NeoQuasar/Kronos-Tokenizer-base)
- **Paper:** [Kronos: A Foundation Model for the Language of Financial Markets](https://huggingface.co/papers/2508.02739)
- **License:** MIT. The vendored code is under `ai-service/vendor/kronos/LICENSE`.

CandleCast adds the web terminal, Node gateway, prediction history, evaluation, walk-forward backtesting, watchlist, alerts and deployment setup. The Kronos model architecture and inference code remain the upstream authors' work.

---

## 11. Final safety notes

- Forecasts are **AI estimates**, not probabilities or promises.
- Do not treat historical accuracy as a guarantee of future results.
- The app is read-only with respect to exchanges: it never places orders.
- Binance data can be delayed, rate-limited or unavailable.
- Keep your `.env` files and any local database dumps out of Git.
