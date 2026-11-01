import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Cpu,
  Database,
  Gauge,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { Badge, Panel, Stat } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { fetchModelInfo, type ModelInfo } from "../services/api";
import { cn } from "../utils/cn";

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-white/5 py-1.5 text-xs first:border-t-0">
      <span className="text-mute">{label}</span>
      <span className="truncate font-mono text-ink">{value ?? "—"}</span>
    </div>
  );
}

export function Settings() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchModelInfo();
      setInfo(data);
      setError(data.loaded ? null : "The inference process is running but Kronos-base is not loaded.");
    } catch (err) {
      const data = (err as { response?: { data?: ModelInfo } }).response?.data;
      if (data) setInfo(data);
      setError(
        "The AI service is unreachable. Forecasts stay disabled rather than falling back to mock candles.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const online = !!info?.loaded;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4 text-accent" />
              Model and environment
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-mute">
              Status reported directly by the Python inference service. Nothing on this page is simulated; if the
              service is offline the terminal refuses to produce a forecast.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={online ? "bull" : loading ? "muted" : "bear"}>
              <span className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-bull" : "bg-bear")} />
              {loading ? "Checking" : online ? "Kronos ready" : "Offline"}
            </Badge>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-xs leading-5 text-bear">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Inference"
            value={online ? "Loaded" : loading ? "…" : "Unavailable"}
            tone={online ? "bull" : loading ? undefined : "bear"}
            hint={info?.model_version ?? "kronos-base"}
          />
          <Stat
            label="Device"
            value={info?.device ? info.device.toUpperCase() : "—"}
            hint={info?.device === "cuda" ? "GPU acceleration" : "CPU sampling"}
          />
          <Stat
            label="Context"
            value={info?.max_context != null ? `${info.max_context} bars` : "—"}
            hint={`default lookback ${info?.default_lookback ?? "—"}`}
          />
          <Stat
            label="Max horizon"
            value={info?.max_pred_len != null ? `${info.max_pred_len} candles` : "—"}
            hint={`UI limit 50 · σ passes ≤ ${info?.max_uncertainty_samples ?? 4}`}
          />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-accent" /> Loaded checkpoint
            </div>
          }
        >
          <div>
            <Row label="Model" value={info?.model_id ?? "NeoQuasar/Kronos-base"} />
            <Row label="Tokenizer" value={info?.tokenizer_id ?? "NeoQuasar/Kronos-Tokenizer-base"} />
            <Row label="Version" value={info?.model_version ?? "—"} />
            <Row label="Parameters" value={info?.params ?? "~102.3M"} />
            <Row label="Max context" value={info?.max_context} />
            <Row label="Max prediction" value={info?.max_pred_len} />
            <Row label="Default lookback" value={info?.default_lookback} />
            <Row label="Runtime device" value={info?.device} />
          </div>
          {info?.notes?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] leading-4 text-mute">
              {info.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel
          title={
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Server className="h-4 w-4 text-accent" /> Runtime
            </div>
          }
        >
          <div>
            <Row label="Gateway" value="Node.js · Express · Socket.IO" />
            <Row label="AI service" value="FastAPI · PyTorch · HTTP" />
            <Row label="Database" value="PostgreSQL via Prisma" />
            <Row label="Cache" value="Redis, in-memory fallback" />
            <Row label="Market data" value="Binance public REST + WebSocket" />
            <Row label="Frontend" value="React · Vite · TypeScript" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-mute">
            <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1.5">
              <Wifi className="h-3 w-3 text-bull" /> WS market stream
            </span>
            <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1.5">
              <Database className="h-3 w-3 text-accent" /> Stored history
            </span>
            <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1.5">
              <Server className="h-3 w-3 text-amber-300" /> Alert monitor
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href="http://localhost:3001/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-accent hover:bg-white/5"
            >
              <BookOpen className="h-3.5 w-3.5" /> Gateway OpenAPI
            </a>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-accent hover:bg-white/5"
            >
              <BookOpen className="h-3.5 w-3.5" /> Inference OpenAPI
            </a>
          </div>
        </Panel>

        <Panel
          title={
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-bull" /> Forecast integrity
            </div>
          }
        >
          <ul className="space-y-2 text-[11px] leading-5 text-mute">
            <li>
              Only the official <span className="text-ink">NeoQuasar/Kronos-base</span> + tokenizer produce forecasts;
              the vendored architecture is unchanged.
            </li>
            <li>
              Model OHLC is validated twice: the AI service repairs and logs impossible candles, then the Node gateway
              independently rejects malformed responses before storage or charting.
            </li>
            <li>
              Accuracy is computed only after real future candles close. Pending forecasts are never counted and no
              accuracy number is estimated.
            </li>
            <li>
              σ bands come from extra independent Kronos passes. They describe sample dispersion, not calibrated
              confidence intervals.
            </li>
            <li>
              Walk-forward backtests build each context from candles available at that origin, so future data cannot
              leak into the model input.
            </li>
          </ul>
        </Panel>

        <Panel
          title={
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-300" /> Limits and disclaimers
            </div>
          }
        >
          <ul className="space-y-2 text-[11px] leading-5 text-mute">
            <li>Forecasts are sampled K-line paths. Repeated runs with the same context can differ.</li>
            <li>
              The app does not place orders, manage positions, or connect to an exchange account. It is a research
              terminal, not a trading bot.
            </li>
            <li>
              CPU inference is slow; more uncertainty passes, scenarios, or backtest windows multiply wall-clock time.
            </li>
            <li>
              Binance rate limits or outages can leave the market view empty. The app reports the failure instead of
              interpolating synthetic prices.
            </li>
            <li>
              Nothing here is financial advice, a profitability claim, or a calibrated probability. Validate any use
              independently.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
