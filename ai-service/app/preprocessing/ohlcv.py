from __future__ import annotations

import pandas as pd

from app.schemas.predict import Candle


REQUIRED = ("open", "high", "low", "close")


def candles_to_frame(candles: list[Candle]) -> pd.DataFrame:
    rows = []
    for candle in candles:
        amount = candle.amount
        typical = (candle.open + candle.high + candle.low + candle.close) / 4.0
        if amount is None:
            amount = candle.volume * typical
        rows.append(
            {
                "timestamp": pd.to_datetime(candle.timestamp, unit="ms", utc=True),
                "open": float(candle.open),
                "high": float(candle.high),
                "low": float(candle.low),
                "close": float(candle.close),
                "volume": float(candle.volume),
                "amount": float(amount),
            }
        )
    df = pd.DataFrame(rows).sort_values("timestamp").reset_index(drop=True)
    return df


def validate_history(df: pd.DataFrame, timeframe_ms: int) -> list[str]:
    notes: list[str] = []
    if df[list(REQUIRED) + ["volume", "amount"]].isnull().any().any():
        raise ValueError("Historical candles contain NaN values")
    if (df["volume"] < 0).any():
        raise ValueError("Historical volume cannot be negative")
    if len(df) < 2:
        return notes

    deltas = df["timestamp"].diff().dt.total_seconds().dropna() * 1000
    expected = float(timeframe_ms)
    mismatched = int((abs(deltas - expected) > expected * 0.05).sum())
    if mismatched:
        notes.append(
            f"{mismatched} candle interval(s) differ from the selected timeframe; "
            "gaps are retained rather than interpolated to avoid fabricating prices."
        )
    duplicates = int(df["timestamp"].duplicated().sum())
    if duplicates:
        raise ValueError("Duplicate candle timestamps are not allowed")
    return notes


def select_lookback(df: pd.DataFrame, lookback: int | None, max_context: int, default_lookback: int) -> tuple[pd.DataFrame, int, list[str]]:
    notes: list[str] = []
    requested = lookback or min(default_lookback, len(df))
    if requested > max_context:
        notes.append(
            f"Requested lookback {requested} exceeds Kronos-base max_context={max_context}; truncating."
        )
        requested = max_context
    if requested > len(df):
        notes.append(f"Requested lookback {requested} exceeds available history {len(df)}; using all rows.")
        requested = len(df)
    if requested < 32:
        raise ValueError("At least 32 historical candles are required for Kronos inference")
    return df.tail(requested).reset_index(drop=True), requested, notes


def future_timestamps(last_open: pd.Timestamp, pred_len: int, timeframe_ms: int) -> pd.Series:
    start = last_open + pd.to_timedelta(timeframe_ms, unit="ms")
    index = pd.date_range(start=start, periods=pred_len, freq=pd.to_timedelta(timeframe_ms, unit="ms"), tz="UTC")
    return pd.Series(index)
