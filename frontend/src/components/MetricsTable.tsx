import type { PredictionMetrics } from "../types/market";

const FIELDS = ["open", "high", "low", "close", "volume"] as const;

export function MetricsTable({ metrics }: { metrics: PredictionMetrics | null | undefined }) {
  if (!metrics) {
    return <p className="text-sm text-mute">No realized candles have been compared yet.</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[420px] font-mono text-[11px]">
        <thead className="text-[9px] uppercase tracking-widest text-mute">
          <tr>
            <th className="pb-1 text-left font-medium">Field</th>
            <th className="pb-1 text-right font-medium">MAE</th>
            <th className="pb-1 text-right font-medium">RMSE</th>
            <th className="pb-1 text-right font-medium">MAPE %</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((field) => (
            <tr key={field} className="border-t border-white/5">
              <td className="py-1 text-mute">{field}</td>
              <td className="py-1 text-right">{metrics.mae[field]?.toFixed(6) ?? "—"}</td>
              <td className="py-1 text-right">{metrics.rmse[field]?.toFixed(6) ?? "—"}</td>
              <td className="py-1 text-right">
                {metrics.mape[field] != null ? metrics.mape[field]?.toFixed(3) : "—"}
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/5">
            <td className="py-1 text-mute">body direction</td>
            <td className="py-1 text-right text-ink" colSpan={3}>
              {(metrics.directional_accuracy * 100).toFixed(1)}%
            </td>
          </tr>
          <tr className="border-t border-white/5">
            <td className="py-1 text-mute">horizon trend</td>
            <td className="py-1 text-right text-ink" colSpan={3}>
              {metrics.trend_directional_accuracy == null
                ? "—"
                : `${(metrics.trend_directional_accuracy * 100).toFixed(1)}%`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
