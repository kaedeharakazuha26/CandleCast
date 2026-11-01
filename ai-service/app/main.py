from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.evaluation.metrics import compute_metrics
from app.inference.engine import InferenceEngine
from app.model.loader import load_bundle
from app.schemas.predict import EvaluateRequest, EvaluateResponse, ModelInfo, PredictRequest, PredictResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("candlecast.api")

engine: InferenceEngine | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global engine
    settings = get_settings()
    bundle = load_bundle(settings)
    engine = InferenceEngine(bundle, settings)
    yield
    engine = None


app = FastAPI(
    title="CandleCast Inference Service",
    version="1.0.0",
    description="Official NeoQuasar/Kronos-base forecasting served over HTTP for CandleCast. Predictions are model samples, not guaranteed prices.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://backend:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_engine() -> InferenceEngine:
    if engine is None:
        raise HTTPException(status_code=503, detail="Inference engine is not initialized")
    return engine


@app.get("/health")
def health() -> dict[str, Any]:
    current = require_engine()
    return {
        "status": "ok" if current.bundle.loaded else "model_not_loaded",
        "loaded": current.bundle.loaded,
        "device": current.bundle.device,
        "model_version": current.bundle.model_version,
    }


@app.get("/model/info", response_model=ModelInfo)
def model_info() -> ModelInfo:
    return ModelInfo(**require_engine().info())


@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    current = require_engine()
    if not current.bundle.loaded:
        raise HTTPException(
            status_code=503,
            detail="Kronos-base is not loaded. Start the AI service with network access to Hugging Face and sufficient memory. No mock forecast is returned.",
        )
    try:
        return current.predict(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Kronos inference failed: {exc}") from exc


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(payload: EvaluateRequest) -> EvaluateResponse:
    current = require_engine()
    if not current.bundle.loaded:
        raise HTTPException(status_code=503, detail="Kronos-base is not loaded; evaluation cannot run.")

    details = []
    skipped = 0
    all_pred: list[dict[str, Any]] = []
    all_act: list[dict[str, Any]] = []
    trend_rows: list[dict[str, Any]] = []

    for window in payload.windows:
        try:
            result = current.predict_from_arrays(
                candles=window.context,
                pred_len=len(window.actual),
                timeframe_ms=payload.timeframe_ms,
                temperature=payload.temperature,
                top_p=payload.top_p,
                sample_count=payload.sample_count,
            )
            predicted = [c.model_dump() for c in result.predicted]
            actual = [c.model_dump() for c in window.actual]
            metrics = compute_metrics(predicted, actual)
            details.append(
                {
                    "ok": True,
                    "metrics": metrics,
                    "inference_ms": result.inference_ms,
                    "context_last_close": window.context[-1].close,
                    "predicted": predicted,
                    "actual": actual,
                }
            )
            trend_rows.append(
                {
                    "predicted": predicted,
                    "actual": actual,
                    "context_last_close": window.context[-1].close,
                }
            )
            all_pred.extend(predicted)
            all_act.extend(actual)
        except Exception as exc:
            skipped += 1
            details.append({"ok": False, "error": str(exc)})

    if not all_pred:
        raise HTTPException(status_code=400, detail="Every evaluation window failed")

    aggregated = compute_metrics(all_pred, all_act, trend_rows)
    return EvaluateResponse(
        model_version=current.bundle.model_version,
        metrics=aggregated,  # type: ignore[arg-type]
        windows_evaluated=len(payload.windows) - skipped,
        skipped=skipped,
        details=details,
    )
