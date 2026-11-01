from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class Candle(BaseModel):
    timestamp: int = Field(..., description="Unix epoch milliseconds (candle open time, UTC)")
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    amount: float | None = None

    @field_validator("volume")
    @classmethod
    def volume_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("volume must be non-negative")
        return value


class PredictRequest(BaseModel):
    candles: list[Candle] = Field(..., min_length=32)
    pred_len: int = Field(..., ge=1, le=120)
    timeframe_ms: int = Field(..., ge=60_000)
    lookback: int | None = Field(default=None, ge=32, le=512)
    temperature: float = Field(default=1.0, ge=0.1, le=2.0)
    top_p: float = Field(default=0.9, ge=0.1, le=1.0)
    top_k: int = Field(default=0, ge=0)
    sample_count: int = Field(default=1, ge=1, le=8)
    # Extra independent passes used only to measure dispersion. The forecast
    # shown to the user is always the base pass; extra passes are not averaged
    # into it.
    uncertainty_samples: int = Field(default=0, ge=0, le=4)
    verbose: bool = False


class Transformation(BaseModel):
    index: int
    timestamp: int
    reason: str
    before: dict[str, float]
    after: dict[str, float]


class PredictedCandle(Candle):
    source: Literal["kronos"] = "kronos"


class PredictResponse(BaseModel):
    model_version: str
    device: str
    lookback: int
    pred_len: int
    max_context: int
    inference_ms: float
    temperature: float
    top_p: float
    sample_count: int
    uncertainty_samples: int = 0
    last_context_timestamp: int
    predicted: list[PredictedCandle]
    transformations: list[Transformation]
    sample_close_std: list[float] | None = None
    sample_high_std: list[float] | None = None
    sample_low_std: list[float] | None = None
    notes: list[str]


class EvaluateWindow(BaseModel):
    context: list[Candle]
    actual: list[Candle]


class EvaluateRequest(BaseModel):
    windows: list[EvaluateWindow] = Field(..., min_length=1, max_length=32)
    temperature: float = 1.0
    top_p: float = 0.9
    sample_count: int = 1
    timeframe_ms: int


class MetricBlock(BaseModel):
    mae: dict[str, float]
    rmse: dict[str, float]
    mape: dict[str, float | None]
    directional_accuracy: float
    trend_directional_accuracy: float | None = None
    bullish_windows: int = 0
    bearish_windows: int = 0
    bullish_directional_accuracy: float | None = None
    bearish_directional_accuracy: float | None = None
    n: int


class EvaluateResponse(BaseModel):
    model_version: str
    metrics: MetricBlock
    windows_evaluated: int
    skipped: int
    details: list[dict[str, Any]]


class ModelInfo(BaseModel):
    loaded: bool
    model_id: str
    tokenizer_id: str
    model_version: str
    max_context: int
    max_pred_len: int
    default_lookback: int
    device: str
    params: str
    max_uncertainty_samples: int = 4
    notes: list[str]
