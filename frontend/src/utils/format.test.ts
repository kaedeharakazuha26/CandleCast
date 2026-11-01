import { describe, expect, it } from "vitest";
import {
  directionTone,
  formatClock,
  formatCompact,
  formatPercent,
  formatPrice,
  metric,
  timeAgo,
} from "./format";

function candleValid(c: { open: number; high: number; low: number; close: number; volume: number }) {
  return c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close) && c.high >= c.low && c.volume >= 0;
}

describe("predicted candle invariants", () => {
  it("accepts a well-formed candle", () => {
    expect(candleValid({ open: 1, high: 2, low: 0.5, close: 1.2, volume: 10 })).toBe(true);
  });
  it("rejects inverted high/low", () => {
    expect(candleValid({ open: 1, high: 0.4, low: 0.5, close: 1, volume: 1 })).toBe(false);
  });
  it("rejects negative volume", () => {
    expect(candleValid({ open: 1, high: 2, low: 0.5, close: 1.2, volume: -1 })).toBe(false);
  });
});

describe("number formatting", () => {
  it("formats prices with more precision for small assets", () => {
    expect(formatPrice(64234.567)).toMatch(/64,234\.5/);
    expect(formatPrice(0.00012345)).toContain("0.00012345");
    expect(formatPrice(Number.NaN)).toBe("—");
    expect(formatPrice(null)).toBe("—");
  });

  it("adds a sign to percentages", () => {
    expect(formatPercent(2.5)).toBe("+2.50%");
    expect(formatPercent(-1.234)).toBe("-1.23%");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("compacts large volumes", () => {
    expect(formatCompact(1_500_000)).toMatch(/1\.5M/i);
    expect(formatCompact(null)).toBe("—");
  });
});

describe("direction helpers", () => {
  it("maps model direction to a colour tone", () => {
    expect(directionTone("Strong Bullish")).toBe("bull");
    expect(directionTone("Bearish")).toBe("bear");
    expect(directionTone("Sideways")).toBe("muted");
    expect(directionTone(null)).toBe("muted");
  });

  it("reads nested metric blocks without inventing values", () => {
    const metrics: Record<string, unknown> = { mae: { close: 1.25 }, rmse: { close: null } };
    expect(metric(metrics, "mae", "close")).toBe(1.25);
    expect(metric(metrics, "rmse", "close")).toBeNull();
    expect(metric(metrics, "mae", "open")).toBeNull();
    expect(metric(null, "mae", "close")).toBeNull();
  });
});

describe("timeAgo", () => {
  it("describes recent timestamps", () => {
    expect(timeAgo(Date.now())).toBe("just now");
    expect(timeAgo(Date.now() - 2 * 3600_000)).toBe("2h ago");
    expect(timeAgo(Date.now() - 3 * 86_400_000)).toBe("3d ago");
    expect(timeAgo(null)).toBe("—");
  });

  it("formats a clock time with seconds", () => {
    expect(formatClock(Date.now())).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(formatClock(null)).toBe("—");
  });
});
