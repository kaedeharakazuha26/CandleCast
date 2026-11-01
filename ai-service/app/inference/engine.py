from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np
import pandas as pd
import torch

from app.config import Settings
from app.inference.validate import validate_predicted_frame
from app.model.loader import ModelBundle
from app.preprocessing.ohlcv import candles_to_frame, future_timestamps, select_lookback, validate_history
from app.schemas.predict import Candle, PredictedCandle, PredictRequest, PredictResponse

logger = logging.getLogger("candlecast.engine")


class InferenceEngine:
    def __init__(self, bundle: ModelBundle, settings: Settings):
        self.bundle = bundle
        self.settings = settings

    def info(self) -> dict[str, Any]:
        return {
            "loaded": self.bundle.loaded,
            "model_id": self.bundle.model_id,
            "tokenizer_id": self.bundle.tokenizer_id,
            "model_version": self.bundle.model_version,
            "max_context": self.bundle.max_context,
            "max_pred_len": self.settings.max_pred_len,
            "default_lookback": self.settings.default_lookback,
            "device": self.bundle.device,
            "params": "102.3M",
            "max_uncertainty_samples": 4,
            "notes": [
                "Kronos-base max_context is 512; longer lookbacks are truncated.",
                "Official examples use pred_len up to 120; this service rejects longer horizons instead of inventing sequential rollouts.",
                "sample_count > 1 averages multiple sampled forecast paths (official KronosPredictor behavior).",
                "uncertainty_samples runs independent extra passes and reports close/high/low standard deviation. It is a sample-path dispersion, not a calibrated probability.",
            ],
        }

    def predict(self, request: PredictRequest) -> PredictResponse:
        if not self.bundle.loaded or self.bundle.predictor is None:
            raise RuntimeError("Kronos model is not loaded")
        if request.pred_len > self.settings.max_pred_len:
            raise ValueError(
                f"pred_len {request.pred_len} exceeds the documented Kronos example horizon "
                f"({self.settings.max_pred_len}). Reduce the horizon instead of fabricating sequential forecasts."
            )

        history = candles_to_frame(request.candles)
        notes = validate_history(history, request.timeframe_ms)
        context, lookback, lookback_notes = select_lookback(
            history,
            request.lookback,
            self.bundle.max_context,
            self.settings.default_lookback,
        )
        notes.extend(lookback_notes)

        x_df = context[["open", "high", "low", "close", "volume", "amount"]]
        x_timestamp = context["timestamp"]
        y_timestamp = future_timestamps(context["timestamp"].iloc[-1], request.pred_len, request.timeframe_ms)

        started = time.perf_counter()
        with torch.no_grad():
            pred_df = self._call_predictor(
                x_df, x_timestamp, y_timestamp, request.pred_len, request, verbose=request.verbose
            )
        elapsed_ms = (time.perf_counter() - started) * 1000

        sample_close_std = None
        sample_high_std = None
        sample_low_std = None
        if request.uncertainty_samples > 0:
            passes = []
            for _ in range(request.uncertainty_samples):
                with torch.no_grad():
                    passes.append(
                        self._call_predictor(
                            x_df, x_timestamp, y_timestamp, request.pred_len, request, verbose=False
                        )
                    )
            close_paths = np.stack([pass_df["close"].to_numpy() for pass_df in passes], axis=0)
            high_paths = np.stack([pass_df["high"].to_numpy() for pass_df in passes], axis=0)
            low_paths = np.stack([pass_df["low"].to_numpy() for pass_df in passes], axis=0)
            sample_close_std = [float(v) for v in np.std(close_paths, axis=0)]
            sample_high_std = [float(v) for v in np.std(high_paths, axis=0)]
            sample_low_std = [float(v) for v in np.std(low_paths, axis=0)]
            notes.append(
                f"Dispersion measured with {request.uncertainty_samples} additional independent Kronos passes. "
                "It describes sample-path spread, not a calibrated confidence interval or probability."
            )
        elif request.sample_count > 1:
            notes.append(
                "sample_count>1 averages sampled paths inside KronosPredictor; independent per-path closes are not "
                "exposed by that call. Enable uncertainty samples to measure dispersion."
            )

        pred_df, transformations = validate_predicted_frame(pred_df)
        predicted = []
        for ts, row in pred_df.iterrows():
            predicted.append(
                PredictedCandle(
                    timestamp=int(pd.Timestamp(ts).timestamp() * 1000),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=max(float(row["volume"]), 0.0),
                    amount=float(row.get("amount", 0.0)),
                )
            )

        last_ts = int(context["timestamp"].iloc[-1].timestamp() * 1000)
        logger.info(
            "inference complete lookback=%s pred_len=%s ms=%.1f repairs=%s uncertainty=%s",
            lookback,
            request.pred_len,
            elapsed_ms,
            len(transformations),
            request.uncertainty_samples,
        )
        return PredictResponse(
            model_version=self.bundle.model_version,
            device=self.bundle.device,
            lookback=lookback,
            pred_len=request.pred_len,
            max_context=self.bundle.max_context,
            inference_ms=round(elapsed_ms, 2),
            temperature=request.temperature,
            top_p=request.top_p,
            sample_count=request.sample_count,
            uncertainty_samples=request.uncertainty_samples,
            last_context_timestamp=last_ts,
            predicted=predicted,
            transformations=transformations,
            sample_close_std=sample_close_std,
            sample_high_std=sample_high_std,
            sample_low_std=sample_low_std,
            notes=notes,
        )

    def _call_predictor(
        self,
        x_df: pd.DataFrame,
        x_timestamp: pd.Series,
        y_timestamp: pd.Series,
        pred_len: int,
        request: PredictRequest,
        verbose: bool,
    ) -> pd.DataFrame:
        if self.bundle.predictor is None:
            raise RuntimeError("Kronos model is not loaded")
        return self.bundle.predictor.predict(
            df=x_df,
            x_timestamp=x_timestamp,
            y_timestamp=y_timestamp,
            pred_len=pred_len,
            T=request.temperature,
            top_k=request.top_k,
            top_p=request.top_p,
            sample_count=request.sample_count,
            verbose=verbose,
        )

    def predict_from_arrays(
        self,
        candles: list[Candle],
        pred_len: int,
        timeframe_ms: int,
        temperature: float = 1.0,
        top_p: float = 0.9,
        sample_count: int = 1,
    ) -> PredictResponse:
        return self.predict(
            PredictRequest(
                candles=candles,
                pred_len=pred_len,
                timeframe_ms=timeframe_ms,
                temperature=temperature,
                top_p=top_p,
                sample_count=sample_count,
            )
        )


def direction_from_closes(start: float, end: float) -> int:
    if end > start:
        return 1
    if end < start:
        return -1
    return 0


def nanstd_safe(values: np.ndarray) -> float:
    if values.size == 0:
        return 0.0
    return float(np.nanstd(values))
