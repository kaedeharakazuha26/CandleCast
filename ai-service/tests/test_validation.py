import pandas as pd

from app.evaluation.metrics import compute_metrics
from app.inference.validate import validate_predicted_frame
from app.preprocessing.ohlcv import candles_to_frame, future_timestamps
from app.schemas.predict import Candle


def test_repairs_invalid_ohlc_and_logs_transformation():
    index = pd.to_datetime(["2024-01-01T00:00:00Z"])
    df = pd.DataFrame(
        {"open": [100.0], "high": [99.0], "low": [101.0], "close": [100.5], "volume": [-3.0], "amount": [1.0]},
        index=index,
    )
    repaired, transformations = validate_predicted_frame(df)
    assert repaired.iloc[0]["high"] >= max(repaired.iloc[0]["open"], repaired.iloc[0]["close"])
    assert repaired.iloc[0]["low"] <= min(repaired.iloc[0]["open"], repaired.iloc[0]["close"])
    assert repaired.iloc[0]["volume"] == 0
    assert transformations
    assert "negative_volume" in transformations[0].reason or "high" in transformations[0].reason


def test_metrics_directional_accuracy():
    predicted = [{"open": 1, "high": 2, "low": 1, "close": 2, "volume": 10}]
    actual = [{"open": 1, "high": 2, "low": 1, "close": 1.5, "volume": 8}]
    metrics = compute_metrics(predicted, actual)
    assert metrics["directional_accuracy"] == 1.0
    assert metrics["n"] == 1


def test_future_timestamps_are_sequential():
    last = pd.Timestamp("2024-01-01T00:00:00Z")
    series = future_timestamps(last, 3, 60_000)
    assert len(series) == 3
    assert (series.iloc[1] - series.iloc[0]).total_seconds() == 60


def test_candles_to_frame_computes_amount():
    candles = [
        Candle(timestamp=1_700_000_000_000, open=1, high=2, low=1, close=1.5, volume=10),
        Candle(timestamp=1_700_000_060_000, open=1.5, high=2, low=1.4, close=1.6, volume=5),
    ]
    df = candles_to_frame(candles)
    assert "amount" in df.columns
    assert df.iloc[0]["amount"] > 0
