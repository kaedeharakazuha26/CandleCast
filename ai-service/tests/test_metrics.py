import math

import pytest

from app.evaluation.metrics import compute_metrics, compute_trend_stats


def candle(open_: float, high: float, low: float, close: float, volume: float) -> dict:
    return {"open": open_, "high": high, "low": low, "close": close, "volume": volume}


def test_metrics_mae_rmse_and_direction():
    predicted = [candle(100, 110, 99, 108, 10), candle(108, 112, 105, 106, 12)]
    actual = [candle(100, 109, 98, 106, 9), candle(106, 107, 100, 101, 8)]

    metrics = compute_metrics(predicted, actual)

    assert metrics["n"] == 2
    assert metrics["mae"]["open"] == pytest.approx(1.0)
    assert metrics["mae"]["close"] == pytest.approx(3.5)
    assert metrics["rmse"]["close"] == pytest.approx(math.sqrt(14.5))
    assert metrics["mape"]["close"] == pytest.approx(3.418643751, rel=1e-9)
    assert metrics["directional_accuracy"] == 1.0
    assert metrics["close_price_error"] == pytest.approx(3.5)


def test_mape_is_none_when_actuals_are_zero():
    metrics = compute_metrics([candle(1, 2, 1, 1, 1)], [candle(0, 0, 0, 0, 1)])
    assert metrics["mape"]["close"] is None


def test_trend_stats_split_bullish_and_bearish_windows():
    rows = [
        {"predicted": [{"close": 110}], "actual": [{"close": 90}], "context_last_close": 100},
        {"predicted": [{"close": 104}], "actual": [{"close": 106}], "context_last_close": 100},
        {"predicted": [{"close": 100}], "actual": [{"close": 100}], "context_last_close": 100},
    ]

    stats = compute_trend_stats(rows)

    assert stats["trend_directional_accuracy"] == pytest.approx(0.5)
    assert stats["bullish_windows"] == 1
    assert stats["bearish_windows"] == 1
    assert stats["bullish_directional_accuracy"] == pytest.approx(1.0)
    assert stats["bearish_directional_accuracy"] == pytest.approx(0.0)


def test_metrics_can_include_trend_fields():
    predicted = [candle(98, 99.5, 97, 99, 1)]
    actual = [candle(99, 106, 98, 105, 1)]
    rows = [{"predicted": predicted, "actual": actual, "context_last_close": 100}]

    metrics = compute_metrics(predicted, actual, trend_rows=rows)

    assert metrics["trend_directional_accuracy"] == 0.0
    assert "bullish_windows" in metrics


def test_empty_overlap_raises():
    with pytest.raises(ValueError):
        compute_metrics([], [])
