from __future__ import annotations

import logging

import pandas as pd

from app.schemas.predict import Transformation

logger = logging.getLogger("candlecast.validate")


def validate_predicted_frame(pred_df: pd.DataFrame) -> tuple[pd.DataFrame, list[Transformation]]:
    """Enforce candlestick inequalities. Repairs are logged, never silent."""
    repaired = pred_df.copy()
    transformations: list[Transformation] = []

    for i, (ts, row) in enumerate(repaired.iterrows()):
        before = {
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
            "amount": float(row.get("amount", 0.0)),
        }
        reasons: list[str] = []
        o, h, l, c, v = before["open"], before["high"], before["low"], before["close"], before["volume"]

        if v < 0:
            v = 0.0
            reasons.append("negative_volume_clipped_to_zero")

        body_high = max(o, c)
        body_low = min(o, c)
        if h < body_high:
            h = body_high
            reasons.append("high_raised_to_max_open_close")
        if l > body_low:
            l = body_low
            reasons.append("low_lowered_to_min_open_close")
        if h < l:
            h, l = l, h
            reasons.append("high_low_swapped")

        after = {
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": v,
            "amount": max(before["amount"], 0.0),
        }

        repaired.iloc[i, repaired.columns.get_loc("high")] = h
        repaired.iloc[i, repaired.columns.get_loc("low")] = l
        repaired.iloc[i, repaired.columns.get_loc("volume")] = v
        if "amount" in repaired.columns:
            repaired.iloc[i, repaired.columns.get_loc("amount")] = after["amount"]

        if reasons:
            ts_ms = int(pd.Timestamp(ts).timestamp() * 1000)
            logger.warning("Predicted candle repaired index=%s ts=%s reasons=%s before=%s after=%s", i, ts_ms, reasons, before, after)
            transformations.append(
                Transformation(
                    index=i,
                    timestamp=ts_ms,
                    reason=";".join(reasons),
                    before=before,
                    after=after,
                )
            )

    return repaired, transformations
