export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function formatTime(timestamp: number | string | null | undefined): string {  if (timestamp == null) return "—";
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(timestamp: number | null | undefined): string {
  if (timestamp == null) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function timeAgo(timestamp: number | string | null | undefined): string {
  if (timestamp == null) return "—";
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

export function directionTone(direction: string | null | undefined): "bull" | "bear" | "muted" {
  if (!direction) return "muted";
  if (direction.includes("Bullish")) return "bull";
  if (direction.includes("Bearish")) return "bear";
  return "muted";
}

export function metric(
  metrics: Record<string, unknown> | null | undefined,
  group: "mae" | "rmse" | "mape",
  field: string,
): number | null {
  if (!metrics) return null;
  const block = metrics[group] as Record<string, number | null> | undefined;
  const value = block?.[field];
  return typeof value === "number" ? value : null;
}
