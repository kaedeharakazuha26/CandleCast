from __future__ import annotations

import math
from typing import Any

import numpy as np


FIELDS = ("open", "high", "low", "close", "volume")


def _mape(actual: np.ndarray, pred: np.ndarray) -> float | None:
    mask = np.abs(actual) > 1e-12
    if not np.any(mask):
        return None
    return float(np.mean(np.abs((actual[mask] - pred[mask]) / actual[mask])) * 100.0)


def _sign(value: float, tolerance: float = 0.0) -> int:
    if value > tolerance:
        return 1
    if value < -tolerance:
        return -1
    return 0


def compute_trend_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Directional performance from the last context close to the horizon close.

    ``rows`` contains ``predicted``, ``actual`` and ``context_last_close`` per
    evaluation window. This measures the call a user would actually act on
    (up/down over the whole horizon), unlike candle-body direction.
    """
    overall: list[bool] = []
    bull: list[bool] = []
    bear: list[bool] = []
    for row in rows:
        predicted = row.get("predicted") or []
        actual = row.get("actual") or []
        base = row.get("context_last_close")
        if not predicted or not actual or base is None or float(base) == 0:
            continue
        p_trend = _sign(float(predicted[-1]["close"]) - float(base))
        a_trend = _sign(float(actual[-1]["close"]) - float(base))
        if a_trend == 0:
            continue
        hit = p_trend == a_trend
        overall.append(hit)
        (bull if a_trend > 0 else bear).append(hit)

    def accuracy(values: list[bool]) -> float | None:
        return float(np.mean(values)) if values else None

    return {
        "trend_directional_accuracy": accuracy(overall),
        "bullish_windows": len(bull),
        "bearish_windows": len(bear),
        "bullish_directional_accuracy": accuracy(bull),
        "bearish_directional_accuracy": accuracy(bear),
    }


def compute_metrics(
    predicted: list[dict[str, Any]],
    actual: list[dict[str, Any]],
    trend_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    n = min(len(predicted), len(actual))
    if n == 0:
        raise ValueError("No overlapping predicted and actual candles")
    pred = predicted[:n]
    act = actual[:n]

    mae: dict[str, float] = {}
    rmse: dict[str, float] = {}
    mape: dict[str, float | None] = {}
    for field in FIELDS:
        a = np.array([float(row[field]) for row in act], dtype=np.float64)
        p = np.array([float(row[field]) for row in pred], dtype=np.float64)
        err = p - a
        mae[field] = float(np.mean(np.abs(err)))
        rmse[field] = float(math.sqrt(np.mean(err**2)))
        mape[field] = _mape(a, p)

    pred_dir = np.sign(np.array([row["close"] for row in pred]) - np.array([row["open"] for row in pred]))
    act_dir = np.sign(np.array([row["close"] for row in act]) - np.array([row["open"] for row in act]))
    directional_accuracy = float(np.mean(pred_dir == act_dir))

    result: dict[str, Any] = {
        "mae": mae,
        "rmse": rmse,
        "mape": mape,
        "directional_accuracy": directional_accuracy,
        "n": n,
        "open_price_error": mae["open"],
        "high_price_error": mae["high"],
        "low_price_error": mae["low"],
        "close_price_error": mae["close"],
        "volume_prediction_error": mae["volume"],
    }
    if trend_rows is not None:
        result.update(compute_trend_stats(trend_rows))
    return result
